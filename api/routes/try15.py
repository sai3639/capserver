import numpy as np
import queue
import sounddevice as sd
import soundfile as sf
import sys
import requests
import matplotlib.pyplot as plt
import os
import traceback
import time
import scipy.signal as sp_signal
import signal

# Global Variables
audio_data = []
recording = False  # recording or not
stream = None
sample_rate = 48000  # samples per second
EXPECTED_WORDS = ["volts", "3 volts", "4 volts", "8 volts", "5 volts", "6 volts", "V12", "antennas deployed"]
recorded_audio = "recorded_audio6.wav"
bit_queue = queue.Queue()

# ----- Backend Recording & Processing -----
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
            with sf.SoundFile(recorded_audio, mode='rb+') as f:
                f.seek(0, sf.SEEK_END)
                f.write(indata)
        except sf.LibsndfileError:
            print("Cannot write to WAV file")
    # push to FFT queue
    try:
        bit_queue.put(indata.copy())
    except Exception as e:
        print(f"Queue error: {e}")


def start_recording():
    global recording, stream
    recording = True
    # create/clear file
    with sf.SoundFile(recorded_audio, mode='w', samplerate=sample_rate, channels=1, subtype='PCM_16'):
        pass
    # start stream
    stream = sd.InputStream(samplerate=sample_rate, channels=1, dtype='float32', callback=audio_callback)
    stream.start()
    print("Recording started")


def stop_recording():
    global recording, stream
    recording = False
    time.sleep(0.5)
    if stream:
        stream.stop()
        stream.close()
    print("Recording stopped")
    if not os.path.exists(recorded_audio) or os.path.getsize(recorded_audio) == 0:
        print("No audio recorded")
        return
    process_recorded_audio()


def process_recorded_audio():
    data, sr = sf.read(recorded_audio, dtype='float32')
    if data.size == 0 or np.max(np.abs(data)) < 1e-6:
        print("Empty audio data")
        return
    # normalize & filter
    norm = normalize_audio(data)
    filtered = bandpass_filter(norm, sr)
    # plot
    plt.figure(figsize=(12,5))
    plt.plot(np.arange(len(filtered)) / sr, filtered)
    plt.title("Filtered AFSK Signal")
    plt.xlabel("Time (s)")
    plt.ylabel("Amplitude")
    plt.grid(True)
    plt.savefig('audio_analysis.png')
    plt.close()

    for baud in [100]:
        bits = demodulate_afsk_fft(filtered, sr, baud_rate=baud)
        print(f"Baud {baud}: Bits: {bits}")
        decoded = uart_decode_msbf(bits)
        print(f"Decoded: {decoded}")
        inv = invert_bits(bits)
        inv_decoded = uart_decode_msbf(inv)
        if any(w in inv_decoded.lower() for w in EXPECTED_WORDS):
            print(f"Inverted decoded: {inv_decoded}")
        send_to_backend(bits, decoded)

# ----- Signal Processing Utilities -----
def normalize_audio(audio):
    max_val = np.max(np.abs(audio)) + 1e-6
    return (audio / max_val) * 4


def bandpass_filter(data, sr, low_cut=1000, high_cut=2500):
    nyq = 0.5 * sr
    low, high = low_cut/nyq, high_cut/nyq
    b, a = sp_signal.butter(6, [low, high], btype='band')
    return sp_signal.filtfilt(b, a, data)


def get_fft_magnitude_at_freq(chunk: np.ndarray, sample_rate: int, freq: float) -> float:
    N = len(chunk)
    win = np.hamming(N)
    yf = np.fft.rfft(chunk * win)
    xf = np.fft.rfftfreq(N, 1 / sample_rate)
    idx = np.argmin(np.abs(xf - freq))
    return np.abs(yf[idx])


def demodulate_afsk_fft(audio: np.ndarray, sample_rate: int, mark_freq=1200, space_freq=2200, baud_rate=1200) -> str:
    spb = int(sample_rate / baud_rate)
    bits = []
    for i in range(0, len(audio), spb):
        chunk = audio[i:i+spb]
        if len(chunk) < spb:
            break
        pm = get_fft_magnitude_at_freq(chunk, sample_rate, mark_freq)
        ps = get_fft_magnitude_at_freq(chunk, sample_rate, space_freq)
        bits.append('1' if pm > ps else '0')
    bitstr = ''.join(bits)
    pre, tail = '00100100', '00100011'
    si = bitstr.find(pre)
    if si != -1:
        bitstr = bitstr[si+len(pre):]
    ti = bitstr.find(tail)
    if ti != -1:
        bitstr = bitstr[:ti]
    return bitstr

# ----- UART & Backend -----
def uart_decode_msbf(bitstr: str) -> str:
    i, chars = 0, []
    while i + 10 <= len(bitstr):
        if bitstr[i] == '0':
            data = bitstr[i+1:i+9]
            if bitstr[i+9] == '1':
                val = int(data, 2)
                chars.append(chr(val) if 32 <= val <= 126 else '.')
                i += 10
                continue
        i += 1
    return ''.join(chars)


def invert_bits(bitstr: str) -> str:
    return ''.join('1' if b=='0' else '0' for b in bitstr)


def send_to_backend(binary_data: str, decoded_text: str):
    payload = {"binaryData": binary_data, "decodedText": decoded_text}
    try:
        resp = requests.post("http://localhost:8888/api/afsk/audio", json=payload)
        print(f"Backend response: {resp.status_code} - {resp.json()}")
    except Exception as e:
        print(f"Send error: {e}")

# ----- Real‑Time FFT AFSK Decoding -----
def decode_afsk_stream(baud: int, f_space: float, f_mark: float, sample_rate: int):
    spb = int(sample_rate / baud)
    stream_rt = sd.InputStream(samplerate=sample_rate, channels=1, callback=audio_callback)
    stream_rt.start()
    print(f"Real‑time FFT AFSK: baud={baud}, space={f_space}, mark={f_mark}")
    try:
        while True:
            data = bit_queue.get()
            samples = data.flatten()
            bitstr = ''
            for i in range(0, len(samples), spb):
                chunk = samples[i:i+spb]
                if len(chunk) < spb:
                    break
                pm = get_fft_magnitude_at_freq(chunk, sample_rate, f_mark)
                ps = get_fft_magnitude_at_freq(chunk, sample_rate, f_space)
                bitstr += '1' if pm > ps else '0'
            print(f"Bits: {bitstr}")
    except KeyboardInterrupt:
        print("\nStopped by user.")
    finally:
        stream_rt.stop()
        stream_rt.close()

if __name__ == "__main__":
    BAUD = 100
    SPACE_FREQ = 1200
    MARK_FREQ = 2200
    SAMPLE_RATE = sample_rate
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    start_recording()
    try:
        decode_afsk_stream(baud=BAUD, f_space=SPACE_FREQ, f_mark=MARK_FREQ, sample_rate=SAMPLE_RATE)
    except Exception as e:
        print(f"Error: {e}")
    finally:
        stop_recording()
