import numpy as np
import matplotlib.pyplot as plt
from scipy import signal
from scipy.io import wavfile
import sounddevice as sd
import requests
import soundfile as sf 
from scipy.signal import resample
import sys
import signal
import time
import re




# List of expected words that may be encoded
EXPECTED_WORDS = ["volts", "3 volts", "4 volts", "8 volts", "5 volts", "6 volts"]
sample_rate = 44100
duration = 5
target_length = int(duration * sample_rate)
channels = 1
recording = False
audio_buffer = []



def record():
    global recording, audio_buffer
    recording = True
    audio_buffer = []
    print("recording start")

    with sd.InputStream(samplerate=sample_rate, channels=channels, dtype='float32') as stream:
        while recording:
            frames, _ = stream.read(1024)
            audio_buffer.extend(frames.flatten())


def save_audio():
    global audio_buffer
    if len(audio_buffer) > 0:
        sf.write("recorded_audio2.wav", np.array(audio_buffer), sample_rate)
        print('audio saved')
    else:
        print('no audio recorded')

def record_callback(indata, frames, time, status):
    """ Callback function to store audio data while recording. """
    if recording:
        audio_buffer.extend(indata[:, 0])  # Store mono audio data

def start_recording():
    """ Starts continuous recording. """
    global recording, audio_buffer
    print("Recording started...")
    recording = True
    audio_buffer = []  # Reset buffer
    with sd.InputStream(samplerate=sample_rate, channels=1, dtype='float32', callback=record_callback):
        while recording:
            sd.sleep(100)  # Keep recording until stopped

def stop_recording():
    """ Stops recording and processes the recorded audio. """
    global recording
    recording = False
    print("Recording stopped. Processing audio...")

    # Convert buffer to NumPy array
    audio_data = record_audio()
    audio_data /= np.max(np.abs(audio_data)) + 1e-6  # Normalize
    #audio_data = np.array(audio_buffer)

    # Save to file for reference
    sf.write("recorded_audio.wav", audio_data, sample_rate)

    # Process the recorded audio
    process(audio_data)


def record_audio():
    """Record audio until stopped."""
    global recording, audio_buffer
    recording = True
    print("Recording started...")
    audio_data = sd.rec(int(sample_rate * 10), samplerate=sample_rate, channels=channels, dtype='float32')
    sd.wait()  # Wait until the recording is complete
    recording = False
    print("Recording stopped.")
    return audio_data.flatten()

# def record_audio(duration, sample_rate):
#     """Record live audio from the second laptop (AUX input)."""
#     print(f"Recording {duration} seconds of audio...")
#     sd.default.samplerate = 44100  # Ensure consistent sample rate

#    # sd.sleep(500)
#     audio_data = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1, dtype='float32')
#     sd.wait()  # Wait for recording to finish
#     print("Recording complete.")
    
#     # Normalize audio data
#     #audio_data = resample(audio_data, target_length)
#     audio_data = audio_data.flatten()
    
#     audio_data /= np.max(np.abs(audio_data)) + 1e-6  # Avoid division by zero
#     audio_data *= 2 #amplify signal
#     return audio_data

def remove_dc_offset(audio_data):
    return audio_data - np.mean(audio_data)  # Subtract DC component

def remove_redundant_bits(bit_string):
    """Remove long runs of 1s or 0s to reduce noise."""
    return re.sub(r'1{8,}|0{8,}', '', bit_string)  # Remove runs of 8+ bits

def read_wav_file(filename):
    """Read and normalize the WAV file."""
    sample_rate, audio_data = wavfile.read(filename)
    if len(audio_data.shape) > 1:
        audio_data = np.mean(audio_data, axis=1)  # Convert stereo to mono
    audio_data = audio_data / np.max(np.abs(audio_data))  # Normalize
    return sample_rate, audio_data

def bandpass_filter(audio_data, sample_rate, low_cutoff=400, high_cutoff=3000):
    """Apply a bandpass filter to extract AFSK tones."""
    nyquist = 0.5 * sample_rate
    low = low_cutoff / nyquist
    high = high_cutoff / nyquist
    b, a = signal.butter(4, [low, high], btype='band')
    return signal.filtfilt(b, a, audio_data)

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
        
        preamble = "00100100"
        preamble_index = bit_string.rfind(preamble)
        if preamble_index != -1:
            bit_string = bit_string[preamble_index + len(preamble):]  # Remove everything before the preamble
           # print(f"Preamble found at index {preamble_index}, decoding starts after it.")
        else:
            print("Preamble not found, decoding might be inaccurate.")
        tail = "00100011"
        tail_index = bit_string.find(tail)
        if tail_index != -1:
            bit_string = bit_string[:tail_index]  # Stop decoding before the tail
            print(f"Tail found at index {tail_index}, decoding stops before it.")

    #return ''.join(binary_data)
    return bit_string

def decode_binary_to_ascii(bit_string):
    """Convert binary string to ASCII text, testing different offsets."""
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

    # Remove leading noise (non-printable characters)
    clean_texts = [(offset, text.lstrip('.')) for offset, text in possible_texts]

    # Find the longest valid text containing expected words
    best_text = ""
    for offset, text in clean_texts:
        for word in EXPECTED_WORDS:
            if word in text.lower():
                if len(text) > len(best_text):
                    best_text = text  # Choose the longest matching text

    return best_text if best_text else clean_texts[0][1]  # Return the best match

def try_inverted_bits(bit_string):
    """Invert binary and decode again."""
    inverted_bits = ''.join('1' if b == '0' else '0' for b in bit_string)
    return decode_binary_to_ascii(inverted_bits)


def send_to_backend(binary_data, decoded_text):
    """Send extracted binary and ASCII text to the backend."""
    payload = {
        "binaryData": binary_data,  # Changed key to match what works
        "decodedText": decoded_text  # Changed key to match what works
    }
    try:
        response = requests.post("http://localhost:8888/afsk/audio", json=payload)
        print(f"Backend response: {response.status_code} - {response.json()}")  # Debugging
    except requests.exceptions.RequestException as e:
        print(f"Error sending data to backend: {e}")


def process(audio_data):
    global audio_buffer
    if len(audio_buffer) == 0:
        print('no audio to process')
        return
    filtered_data = bandpass_filter(audio_data)
    bit_string = demodulate_afsk(filtered_data)
    decoded_text = decode_binary_to_ascii(bit_string)
    print(f"Extracted binary data: {bit_string}")
    print(f"Decoded text: {decoded_text}")

      # Send data to backend
    send_to_backend(bit_string, decoded_text)

    # Generate plots
    plot_signals(audio_data, filtered_data)


def plot_signals(original, filtered):
    """ Plots the recorded and filtered AFSK signals. """
    time = np.arange(len(original)) / sample_rate
    plt.figure(figsize=(12, 5))
    
    plt.subplot(2, 1, 1)
    plt.plot(time, original, label="Recorded Signal")
    plt.title("Recorded AFSK Signal")
    plt.xlabel("Time (s)")
    plt.ylabel("Amplitude")
    plt.legend()
    plt.grid()

    plt.subplot(2, 1, 2)
    plt.plot(time[:len(filtered)], filtered, label="Filtered Signal", color='orange')
    plt.title("Filtered AFSK Signal")
    plt.xlabel("Time (s)")
    plt.ylabel("Amplitude")
    plt.legend()
    plt.grid()

    plt.tight_layout()
    plt.show()

# def main():
#    # filename = "4volts.wav"  # Update this to match your input file
#     #sample_rate, audio_data = read_wav_file(filename)
#     audio_data = record_audio(duration, sample_rate)
#     plt.plot(audio_data)
#     plt.title("Recorded Audio Waveform")
#     plt.show()

#     # Apply AGC to amplify weak signals
#    # audio_data = audio_data / (np.max(np.abs(audio_data)) + 1e-6)
#     sf.write("recorded_audio.wav", audio_data, sample_rate)

#    # audio_data = remove_dc_offset(audio_data)

#     filtered_data = bandpass_filter(audio_data, sample_rate)
    
#     # Try multiple baud rates dynamically
#     possible_baud_rates = [300]  

#     for baud_rate in possible_baud_rates:
#         bit_string = demodulate_afsk(filtered_data, sample_rate, baud_rate=baud_rate)

#         print(f"\nBaud Rate: {baud_rate} bps")
#         print(f"Extracted binary data: {bit_string}")
#         filtered_bits = remove_redundant_bits(bit_string)

#         decoded_text = decode_binary_to_ascii(bit_string)
#         print(f"Decoded text: {decoded_text}")

#         # Try inverted bits
#         inverted_text = try_inverted_bits(bit_string)
#         if any(word in inverted_text.lower() for word in EXPECTED_WORDS):
#             print(f"Decoded (Inverted) text: {inverted_text}")


#         send_to_backend(bit_string, decoded_text)

#     # Plot filtered signal
#     time = np.arange(len(filtered_data)) / sample_rate
#     plt.figure(figsize=(12, 5))
#     plt.plot(time, filtered_data)
#     plt.title("Filtered AFSK Signal")
#     plt.xlabel("Time (s)")
#     plt.ylabel("Amplitude")
#     plt.grid(True)
#     plt.show()

#if __name__ == "__main__":
   # main()

def signal_handler(sig, frame):
    """ Handles SIGTERM signal to stop recording. """
    print("Termination signal received, stopping recording...")
    stop_recording()
    sys.exit(0)


if __name__ == "__main__":
    # Handle termination signals
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    # Start or stop based on command-line argument
    if len(sys.argv) > 1 and sys.argv[1] == "start":
        stop_recording()
    elif len(sys.argv) > 1 and sys.argv[1] == "stop":
        stop_recording()
    else:
        print("Usage: python script.py start|stop")