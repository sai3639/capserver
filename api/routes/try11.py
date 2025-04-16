import numpy as np
import sounddevice as sd
import soundfile as sf
import sys
import requests
import matplotlib.pyplot as plt
import os
import traceback
import time
import scipy.signal as sp_signal
import re
import signal
import soundfile as sf



# Global Variables
audio_data = []
recording = False #recording or not
stream = None
sample_rate = 8000 #audio signal recroded at 8000 times per sec
#words that want to find
EXPECTED_WORDS = ["volts", "3 volts", "4 volts", "8 volts", "5 volts", "6 volts", "V12"]
recorded_audio = "recorded_audio6.wav" #store recorded audio

def signal_handler(signum, frame):
    global recording, stream
    recording = False
    if stream:
        stream.stop()
        stream.close()

signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

def audio_callback(indata, frames, time, status):
    if status:
        print(f"status: {status}")

    if recording:
        try:
            # Append to the file correctly
            with sf.SoundFile(recorded_audio, mode='rb+') as file:
                file.seek(0, sf.SEEK_END)  # Move to end before writing
                file.write(indata)
            print(f"got {len(indata.flatten())} samples...")

        except sf.LibsndfileError:
            print("cant write to wav file")

def start_recording():
    global recording, stream
    print("Recording started")

    recording = True  # star trecording

    # Create file
    with sf.SoundFile(recorded_audio, mode='w', samplerate=sample_rate, channels=1, subtype='PCM_16') as file:
        pass

    try:
        stream = sd.InputStream(samplerate=sample_rate, channels=1, dtype='float32', callback=audio_callback)
        stream.start()

        while recording:
            time.sleep(1)

    except Exception as e:
        print(f"Error starting recording")
        traceback.print_exc()


def normalize_audio(audio_data):
    if len(audio_data) == 0:
        return audio_data
    max_val = np.max(np.abs(audio_data)) + 1e-6  # no division by zero
    return (audio_data / max_val) * 4  # Amplify signal


def stop_recording():
    global recording, stream, audio_data
    recording = False
    time.sleep(1)  # Ensure all audio data is captured before stopping

    if stream:
        stream.stop()
        stream.close()

    
    if not os.path.exists(recorded_audio) or os.path.getsize(recorded_audio) == 0:
        print("No audio recorded")
        return
    


    return process_recorded_audio()

def process_recorded_audio():
    global audio_data

    if not os.path.exists(recorded_audio):
        print("audio file found.")
        return
    
    audio_data, sample_rate = sf.read(recorded_audio, dtype='float32')

    
    if len(audio_data) == 0 or np.max(np.abs(audio_data)) < 1e-6:
        print("audio data empty")
        return

    print(f"Loaded {len(audio_data)} samples from file.")

    audio_data = np.array(audio_data, dtype=np.float32)
    audio_data = normalize_audio(audio_data)  # normalize


    #  bandpass filter
    filtered_data = bandpass_filter(audio_data, sample_rate)

    # Plot signal
    plot_filename = f'static/plots/audio_analysis.png'
    plt.figure(figsize=(12, 5))
    plt.plot(np.arange(len(filtered_data)) / sample_rate, filtered_data)
    plt.title("Filtered AFSK Signal")
    plt.xlabel("Time (s)")
    plt.ylabel("Amplitude")
    plt.grid(True)
    plt.savefig(plot_filename)
    plt.close()
    #plt.show()

    # demodulation
    possible_baud_rates = [300]  #test baud rates to find ebst one

    for baud_rate in possible_baud_rates:
        bit_string = demodulate_afsk(filtered_data, sample_rate, baud_rate=baud_rate)

        print(f"\nBaud Rate: {baud_rate} bps")
        print(f"Extracted binary data: {bit_string}")
        filtered_bits = remove_redundant_bits(bit_string)

        decoded_text = decode_binary_to_ascii(bit_string)
        print(f"Decoded text: {decoded_text}")

        #inverted bits
        inverted_text = try_inverted_bits(bit_string)
        if any(word in inverted_text.lower() for word in EXPECTED_WORDS):
            print(f"Decoded (Inverted) text: {inverted_text}")


        send_to_backend(bit_string, decoded_text)



def bandpass_filter(audio_data, sample_rate, low_cutoff=1000, high_cutoff=2500):
    nyquist = 0.5 * sample_rate
    low = low_cutoff / nyquist
    high = high_cutoff / nyquist
    b, a = sp_signal.butter(6, [low, high], btype='band')
    return sp_signal.filtfilt(b, a, audio_data)

def goertzel(samples, sample_rate, target_freq):
    N = len(samples)
    k = int(0.5 + (N * target_freq / sample_rate))
    omega = (2.0 * np.pi * k) / N
    coeff = 2.0 * np.cos(omega)
    
    s1, s2 = 0.0, 0.0
    for sample in samples:
        s = sample + coeff * s1 - s2
        s2, s1 = s1, s
    
    power = s2**2 + s1**2 - coeff * s1 * s2
    return power


def fft_analysis(samples, sample_rate, target_freqs):
    spectrum = np.fft.rfft(samples)
    N = len(samples)
    freqs = np.fft.fftfreq(N, d=1/sample_rate)
    
    magnitudes = {}
    for freq in target_freqs:
        bin_index = int(round(freq * N / sample_rate))
        if 0 <= bin_index < len(spectrum):
            magnitudes[freq] = abs(spectrum[bin_index])
        else:
            magnitudes[freq] = 0
    return magnitudes


def demodulate_afsk(audio_data, sample_rate, mark_freq=1200, space_freq=2200, baud_rate=1200):
    samples_per_bit = int(sample_rate / baud_rate)
    binary_data = []

#analuze signal across the spectrum
    fft_magnitudes = fft_analysis(audio_data, sample_rate, [mark_freq, space_freq])
    fft_threshold = 100  
    if fft_magnitudes[mark_freq] > fft_threshold and fft_magnitudes[space_freq] > fft_threshold:
        print("both mark and space tones present.")


    for i in range(0, len(audio_data), samples_per_bit):
        chunk = audio_data[i:i + samples_per_bit]
        if len(chunk) < samples_per_bit // 2:
            break

        power_mark = goertzel(chunk, sample_rate, mark_freq)
        power_space = goertzel(chunk, sample_rate, space_freq)

        if power_mark > power_space:
            binary_data.append('1')
        else:
            binary_data.append('0')

    bit_string = ''.join(binary_data)

    # Detect preamble ($ = "00100100") 
    preamble = "00100100"
    preamble_index = bit_string.find(preamble)
    if preamble_index != -1:
        bit_string = bit_string[preamble_index + len(preamble):]  # Start decoding after preamble
    else:
        print("Preamble not found")

    # Detect tail (# = "00100011") 
    tail = "00100011"
    tail_index = bit_string.find(tail)
    if tail_index != -1:
        bit_string = bit_string[:tail_index]  # Stop decoding before the tail

    return bit_string


def remove_redundant_bits(bit_string):
    return re.sub(r'1{8,}|0{8,}', '', bit_string)  # Remove runs of 8+ bits

def decode_binary_to_ascii(bit_string):
    possible_texts = []
    
    for offset in range(8):  # Try different bit alignments
        raw_text = ""
        for i in range(offset, len(bit_string) - 7, 8):
            char_code = int(bit_string[i:i+8], 2)
            if 32 <= char_code <= 126:  
                raw_text += chr(char_code)
            else:
                raw_text += "."

        possible_texts.append((offset, raw_text))

    best_text = max(possible_texts, key=lambda x: len(x[1]))[1]
    
    return best_text if best_text else possible_texts[0][1]  # Return the best match

def try_inverted_bits(bit_string):
    inverted_bits = ''.join('1' if b == '0' else '0' for b in bit_string)
    return decode_binary_to_ascii(inverted_bits)

def send_to_backend(binary_data, decoded_text):
    payload = {"binaryData": binary_data, "decodedText": decoded_text}
    try:
        response = requests.post("http://localhost:8888/api/afsk/audio", json=payload)
        print(f"Backend response: {response.status_code} - {response.json()}")
    except requests.exceptions.RequestException as e:
        print(f"Error sending data to backend: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        if sys.argv[1] == "start":
            start_recording()
        elif sys.argv[1] == "stop":
            stop_recording()
    else:
        print("Usage: python script.py start|stop")
