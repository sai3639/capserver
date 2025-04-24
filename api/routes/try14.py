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

# Global Variables
audio_data = []
recording = False  # recording or not
stream = None
sample_rate = 48000  # audio signal recorded at 48000 samples per sec
EXPECTED_WORDS = ["volts", "3 volts", "4 volts", "8 volts", "5 volts", "6 volts", "V12", "antennas deployed"]
recorded_audio = "recorded_audio6.wav"  # store recorded audio

ESC = bytes([0x1B])

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
            with sf.SoundFile(recorded_audio, mode='rb+') as file:
                file.seek(0, sf.SEEK_END)
                file.write(indata)
            print(f"got {len(indata.flatten())} samples...")
        except sf.LibsndfileError:
            print("cant write to wav file")




def start_recording():
    global recording, stream
    print("Recording started")

    recording = True
    with sf.SoundFile(recorded_audio, mode='w', samplerate=sample_rate, channels=1, subtype='PCM_16') as file:
        pass

    try:
        stream = sd.InputStream(samplerate=sample_rate, channels=1, dtype='float32', callback=audio_callback)
        stream.start()
        while recording:
            time.sleep(1)
    except Exception:
        print("Error starting recording")
        traceback.print_exc()

def normalize_audio(audio_data):
    if len(audio_data) == 0:
        return audio_data
    max_val = np.max(np.abs(audio_data)) + 1e-6
    return (audio_data / max_val) * 4

def stop_recording():
    global recording, stream, audio_data
    recording = False
    time.sleep(1)
    if stream:
        stream.stop()
        stream.close()
    if not os.path.exists(recorded_audio) or os.path.getsize(recorded_audio) == 0:
        print("No audio recorded")
        return
    return process_recorded_audio()

def find_preamble_fuzzy(bit_string, preamble="00100100", max_errors=1):
    for i in range(len(bit_string) - len(preamble)):
        window = bit_string[i:i+len(preamble)]
        errors = sum(1 for a, b in zip(window, preamble) if a != b)
        if errors <= max_errors:
            return i
    return -1


def sync_to_preamble(bit_string, preamble='00100100', search_window=100):
    best_match = -1
    lowest_errors = len(preamble)
    for i in range(search_window):
        window = bit_string[i:i+len(preamble)]
        if len(window) < len(preamble):
            break
        errors = sum(a != b for a, b in zip(window, preamble))
        if errors < lowest_errors:
            best_match = i
            lowest_errors = errors
    if lowest_errors <= 1:  # allow 1 error
        return best_match + len(preamble)
    return -1



def process_recorded_audio():
    global audio_data
    if not os.path.exists(recorded_audio):
        print("audio file not found.")
        return
    audio_data, sample_rate = sf.read(recorded_audio, dtype='float32')
    if sample_rate > 48000:
        print(f"Resampling from {sample_rate} Hz to 48000 Hz...")
        gcd = np.gcd(sample_rate, 48000)
        up = 48000 // gcd
        down = sample_rate // gcd
        audio_data = sp_signal.resample_poly(audio_data, up, down)
        sample_rate = 48000
        print(f"Resampling complete. New length: {len(audio_data)} samples")

    if len(audio_data) == 0 or np.max(np.abs(audio_data)) < 1e-6:
        print("audio data empty")
        return
    print(f"Loaded {len(audio_data)} samples from file.")
    audio_data = normalize_audio(audio_data)
    filtered_data = bandpass_filter(audio_data, sample_rate)
    # Plot
    plt.figure(figsize=(12, 5))
    plt.plot(np.arange(len(filtered_data)) / sample_rate, filtered_data)
    plt.title("Filtered AFSK Signal")
    plt.xlabel("Time (s)")
    plt.ylabel("Amplitude")
    plt.grid(True)
    plot_filename = 'static/plots/audio_analysis.png'
    #plt.savefig(plot_filename)
    plt.savefig('static/plots/audio_analysis.png')
   # plt.show()
    plt.close()
    #send_plot_to_backend(plot_filename)

    possible_baud_rates = [50]
    for baud_rate in possible_baud_rates:
        bit_string, goertzel_plot_filename = demodulate_afsk(filtered_data, sample_rate, baud_rate=baud_rate)
        print(f"\nBaud Rate: {baud_rate} bps")
        print(f"Raw bits: {bit_string}")

        # UART MSB-first decode
        decoded_uart = uart_decode_msbf(bit_string)
        print(f"Decoded UART (MSB-first): {decoded_uart}")

        #offset = find_best_offset(audio_data, sample_rate, 1200, 2200, baud_rate)

        # HDLC-style frame extraction (if using $ and # as frame markers)
        frames = decoded_uart.split('$')[1:]  # Discard any noise before the first start-of-frame

        clean = ""

        for f in frames:
            if '#' in f:
                payload, _ = f.split('#', 1)
                try:
                    clean = destuff(payload.encode('latin1')).decode('ascii', 'ignore')
                    print("RX payload:", clean)
                    #send_to_backend(bit_string, clean)
                except Exception as e:
                    print(f"Failed to destuff and decode: {e}")



        # fallback inverted
        inv = invert_bits(bit_string)
        inv_decoded = uart_decode_msbf(inv)
        if any(w in inv_decoded.lower() for w in EXPECTED_WORDS):
            print(f"Decoded (inverted MSB-first): {inv_decoded}")

        send_to_backend(bit_string, decoded_uart, clean, plot_filename, goertzel_plot_filename)


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
    return s2**2 + s1**2 - coeff * s1 * s2




def demodulate_afsk(audio_data, sample_rate, mark_freq=1200, space_freq=2200, baud_rate=50):
    samples_per_bit = int(sample_rate / baud_rate)
    bits = []
    bit_times = []
    mark_powers = []
    space_powers = []

    for i in range(0, len(audio_data), samples_per_bit):
        chunk = audio_data[i:i+samples_per_bit]
        if len(chunk) < samples_per_bit // 2:
            break
        pm = goertzel(chunk, sample_rate, mark_freq)
        ps = goertzel(chunk, sample_rate, space_freq)
        bit = '1' if pm > ps else '0'
        bits.append(bit)
        bit_times.append(i + samples_per_bit // 2)
        mark_powers.append(pm)
        space_powers.append(ps)

    bit_string = ''.join(bits)


    
    # Detect preamble ($ = "00100100") and remove everything before it
    # preamble = "00100100"
    # preamble_index = bit_string.find(preamble)
    # #preamble_index = sync_to_preamble(bit_string)
    # if preamble_index != -1:
    #     bit_string = bit_string[preamble_index + len(preamble):]  # Start decoding after preamble
    #     print(f"Preamble found at index {preamble_index}, decoding starts after it.")
    # else:
    #     print("Preamble not found, decoding might be inaccurate.")

    # # Detect tail (# = "00100011") and remove everything after it
    # tail = "00100011"
    # tail_index = bit_string.find(tail)
    # if tail_index != -1:
    #     bit_string = bit_string[:tail_index]  # Stop decoding before the tail
    #     print(f"Tail found at index {tail_index}, decoding stops before it.")


    # Plot power at each bit window
    bit_t = np.array(bit_times) / sample_rate
    plt.figure(figsize=(14, 6))
    plt.plot(bit_t, mark_powers, label="1200 Hz (Mark) Power", color='green', marker='o')
    plt.plot(bit_t, space_powers, label="2200 Hz (Space) Power", color='red', marker='x')
    plt.fill_between(bit_t, mark_powers, space_powers, where=np.array(mark_powers) > np.array(space_powers), 
                     color='green', alpha=0.2)
    plt.fill_between(bit_t, space_powers, mark_powers, where=np.array(space_powers) > np.array(mark_powers), 
                     color='red', alpha=0.2)
    plt.title("Goertzel Tone Power per Bit Window")
    plt.xlabel("Time (s)")
    plt.ylabel("Power")
    plt.legend()
    plt.grid(True)
    plt.tight_layout()
    #plt.show()

    goertzel_plot_filename = 'static/plots/goertzel_power_plot.png'
    #plt.savefig(goertzel_plot_filename)
    plt.savefig('static/plots/goertzel_power_plot.png')
    plt.close()

    # Send the plot to the backend
    #send_plot_to_backend(goertzel_plot_filename)

    return bit_string, goertzel_plot_filename


def uart_decode_msbf(bit_string):
    i = 0
    chars = []
    while i + 10 <= len(bit_string):
        if bit_string[i] == '0':  # start bit
            data = bit_string[i+1:i+9]
            stop_bit = bit_string[i+9]
            if stop_bit == '1':
                try:
                    val = int(data, 2)
                    if 32 <= val <= 126:
                        chars.append(chr(val))
                    else:
                        chars.append('.')
                    i += 10
                    continue
                except:
                    pass
        i += 1  # shift forward by 1 if invalid
    return ''.join(chars)


def destuff(rx_bytes: bytes) -> bytes:
    out, esc = bytearray(), False
    for b in rx_bytes:
        if esc:
            out.append(b ^ 0x20)      # undo bit-flip
            esc = False
        elif b == ESC[0]:
            esc = True
        else:
            out.append(b)
    return bytes(out)


def invert_bits(bit_string):
    return ''.join('1' if b=='0' else '0' for b in bit_string)

def send_to_backend(binary_data, decoded_uart, clean, plot_filename, goertzel_plot_filename):
    payload = {"binaryData": binary_data, "decodedUart": decoded_uart, "clean": clean, "plotPath": plot_filename, "goertzelPlotPath": goertzel_plot_filename}
    try:
        resp = requests.post("http://localhost:8888/api/afsk/audio", json=payload)
        print(f"Backend response: {resp.status_code} - {resp.json()}")
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