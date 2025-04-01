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
recording = False
stream = None
sample_rate = 44100
EXPECTED_WORDS = ["volts", "3 volts", "4 volts", "8 volts", "5 volts", "6 volts", "V12"]
AUDIO_FILE = "audio_data.npy"  # File to store recorded audio
recorded_audio = "recorded_audio4.wav"

def signal_handler(signum, frame):
    """Handles termination signals to stop recording safely."""
    global recording, stream
    print(f"Received signal {signum}, stopping recording...")
    recording = False
    if stream:
        stream.stop()
        stream.close()

signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

def audio_callback(indata, frames, time, status):
    """Callback function to write recorded audio into a file."""
    if status:
        print(f"Stream status: {status}")

    if recording:
        try:
            # Append to the file correctly
            with sf.SoundFile(recorded_audio, mode='rb+') as file:
                file.seek(0, sf.SEEK_END)  # Move to end before writing
                file.write(indata)
            print(f"Captured {len(indata.flatten())} samples...")

        except sf.LibsndfileError:
            print("Error: Attempting to write to an invalid or missing WAV file.")

def start_recording():
    """Starts the recording process."""
    global recording, stream
    print("Starting recording...")

    recording = True  # Set flag to start recording

    # Create the file first to avoid "file not found" error
    with sf.SoundFile(recorded_audio, mode='w', samplerate=sample_rate, channels=1, subtype='PCM_16') as file:
        print("WAV file created successfully.")

    try:
        print("Opening audio input stream...")
        stream = sd.InputStream(samplerate=sample_rate, channels=1, dtype='float32', callback=audio_callback)
        stream.start()
        print("Recording started successfully.")

        while recording:
            time.sleep(1)

    except Exception as e:
        print(f"Error starting recording: {e}")
        traceback.print_exc()


def normalize_audio(audio_data):
    """Normalize and amplify audio data to match previous method."""
    if len(audio_data) == 0:
        return audio_data
    max_val = np.max(np.abs(audio_data)) + 1e-6  # Avoid division by zero
    return (audio_data / max_val) * 2  # Amplify signal


def stop_recording():
    """Stops the recording process and saves audio data."""
    global recording, stream, audio_data
    print("Stopping recording...")
    recording = False
    time.sleep(1)  # Ensure all audio data is captured before stopping

    if stream:
        stream.stop()
        stream.close()
        print("Stream closed.")

    print(f"Total recorded samples: {len(audio_data)}")
    
    if not os.path.exists(recorded_audio) or os.path.getsize(recorded_audio) == 0:
        print("No audio recorded.")
        return
    
    

    # Save recorded audio to file
    # if audio_data:
    #     np.save(AUDIO_FILE, np.array(audio_data, dtype=np.float32))
    #     print(f"Recording saved to '{AUDIO_FILE}' with {len(audio_data)} samples.")
    # else:
    #     print("No audio recorded.")

    return process_recorded_audio()

def process_recorded_audio():
    """Loads recorded audio from file, processes it, and sends to backend."""
    global audio_data

    if not os.path.exists(recorded_audio):
        print("No recorded audio file found.")
        return
    
    audio_data, sample_rate = sf.read(recorded_audio, dtype='float32')

    # Load saved audio data
   # audio_data = np.load(AUDIO_FILE, allow_pickle=True)

    
    
    if len(audio_data) == 0 or np.max(np.abs(audio_data)) < 1e-6:
        print("Warning: Audio data is too small or empty. Check recording.")
        return

    print(f"Loaded {len(audio_data)} samples from file.")

    audio_data = np.array(audio_data, dtype=np.float32)
    audio_data = normalize_audio(audio_data)  # Apply normalization

    # Normalize audio
  #  audio_data = audio_data - np.mean(audio_data)
   # audio_data = audio_data / np.max(np.abs(audio_data))

    # Apply bandpass filter
    filtered_data = bandpass_filter(audio_data, sample_rate)
    print("Bandpass filter applied.")

    # Plot filtered signal
    plt.figure(figsize=(12, 5))
    plt.plot(np.arange(len(filtered_data)) / sample_rate, filtered_data)
    plt.title("Filtered AFSK Signal")
    plt.xlabel("Time (s)")
    plt.ylabel("Amplitude")
    plt.grid(True)
    plt.show()

    # Perform AFSK demodulation
    possible_baud_rates = [300]  

    for baud_rate in possible_baud_rates:
        bit_string = demodulate_afsk(filtered_data, sample_rate, baud_rate=baud_rate)

        print(f"\nBaud Rate: {baud_rate} bps")
        print(f"Extracted binary data: {bit_string}")
        filtered_bits = remove_redundant_bits(bit_string)

        decoded_text = decode_binary_to_ascii(bit_string)
        print(f"Decoded text: {decoded_text}")

        # Try inverted bits
        inverted_text = try_inverted_bits(bit_string)
        if any(word in inverted_text.lower() for word in EXPECTED_WORDS):
            print(f"Decoded (Inverted) text: {inverted_text}")


        send_to_backend(bit_string, decoded_text)

    # Plot filtered signal
    time = np.arange(len(filtered_data)) / sample_rate
    plt.figure(figsize=(12, 5))
    plt.plot(time, filtered_data)
    plt.title("Filtered AFSK Signal")
    plt.xlabel("Time (s)")
    plt.ylabel("Amplitude")
    plt.grid(True)
    plt.show()

def bandpass_filter(audio_data, sample_rate, low_cutoff=400, high_cutoff=3000):
    """Apply a bandpass filter to extract AFSK tones."""
    nyquist = 0.5 * sample_rate
    low = low_cutoff / nyquist
    high = high_cutoff / nyquist
    b, a = sp_signal.butter(6, [low, high], btype='band')
    return sp_signal.filtfilt(b, a, audio_data)

def goertzel(samples, sample_rate, target_freq):
    """Goertzel algorithm to detect specific frequencies."""
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

def demodulate_afsk(audio_data, sample_rate, mark_freq=1200, space_freq=2200, baud_rate=1200):
    """Demodulate AFSK using Goertzel algorithm and apply majority voting."""
    samples_per_bit = int(sample_rate / baud_rate)
    binary_data = []

    for i in range(0, len(audio_data), samples_per_bit):
        chunk = audio_data[i:i + samples_per_bit]
        if len(chunk) < samples_per_bit // 2:
            break

        power_mark = goertzel(chunk, sample_rate, mark_freq)
        power_space = goertzel(chunk, sample_rate, space_freq)

        # Majority voting to remove noise
        if power_mark > power_space:
            binary_data.append('1')
        else:
            binary_data.append('0')

    bit_string = ''.join(binary_data)

    # Detect preamble ($ = "00100100") and remove everything before it
    preamble = "00100100"
    preamble_index = bit_string.find(preamble)
    if preamble_index != -1:
        bit_string = bit_string[preamble_index + len(preamble):]  # Start decoding after preamble
        print(f"Preamble found at index {preamble_index}, decoding starts after it.")
    else:
        print("Preamble not found, decoding might be inaccurate.")

    # Detect tail (# = "00100011") and remove everything after it
    tail = "00100011"
    tail_index = bit_string.find(tail)
    if tail_index != -1:
        bit_string = bit_string[:tail_index]  # Stop decoding before the tail
        print(f"Tail found at index {tail_index}, decoding stops before it.")

    return bit_string


def remove_redundant_bits(bit_string):
    """Remove long runs of 1s or 0s to reduce noise.""" 
    return re.sub(r'1{8,}|0{8,}', '', bit_string)  # Remove runs of 8+ bits

def decode_binary_to_ascii(bit_string):
    """Convert binary string to ASCII text by testing different bit alignments."""
    possible_texts = []
    
    for offset in range(8):  # Try different bit alignments
        raw_text = ""
        for i in range(offset, len(bit_string) - 7, 8):
            char_code = int(bit_string[i:i+8], 2)
            if 32 <= char_code <= 126:  # Printable ASCII range
                raw_text += chr(char_code)
            else:
                raw_text += "."

        possible_texts.append((offset, raw_text))

    # Pick the longest valid text
    best_text = max(possible_texts, key=lambda x: len(x[1]))[1]
    
    return best_text if best_text else possible_texts[0][1]  # Return the best match

def try_inverted_bits(bit_string):
    """Invert binary and decode again."""
    inverted_bits = ''.join('1' if b == '0' else '0' for b in bit_string)
    return decode_binary_to_ascii(inverted_bits)

def send_to_backend(binary_data, decoded_text):
    """Send extracted binary and ASCII text to the backend."""
    payload = {"binaryData": binary_data, "decodedText": decoded_text}
    try:
        response = requests.post("http://localhost:8888/afsk/audio", json=payload)
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
