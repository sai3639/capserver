import numpy as np
import queue
import sounddevice as sd
import sys

"""
AFSK decoder that listens to the default system microphone in real‑time.
Tested with 300‑baud Bell 202 (space 1200 Hz, mark 2200 Hz) but the
frequencies and baud rate are configurable.

Install requirements first:
    pip install sounddevice numpy
    
Press Ctrl‑C or notebook stop (interrupt the kernel) to stop.
"""

# ---------------- FFT helper -------------------------------------------------

def get_fft_magnitude_at_freq(chunk: np.ndarray, sample_rate: int, freq: float) -> float:
    """Return magnitude of *freq* in *chunk* using an rFFT."""
    spectrum = np.fft.rfft(chunk)
    N = len(chunk)
    bin_index = int(round(freq * N / sample_rate))
    if 0 <= bin_index < len(spectrum):
        return abs(spectrum[bin_index])
    return 0.0

# ---------------- AFSK stream decoder ---------------------------------------

def decode_afsk_stream(
    baud: int = 1200,
    f_space: int = 1200,
    f_mark: int = 2200,
    sample_rate: int = 48000,
):
    """Listen to the microphone and decode an AFSK stream in real‑time."""
    samples_per_bit = int(sample_rate / baud)

    # Queue for audio callback -> processing thread
    audio_q: queue.Queue[np.ndarray] = queue.Queue()

    def audio_callback(indata, frames, time, status):  # pylint: disable=unused-argument
        # indata shape: (frames, channels); we flatten to mono float32 [-1,1]
        if status:
            print(status, file=sys.stderr)
        audio_q.put(indata[:, 0].copy())

    # Buffer holding at least one bit‑period of samples
    sample_buffer = np.empty(0, dtype=np.float32)
    bits = []  # collected raw bits

    print(
        f"Listening: baud={baud}, mark={f_mark} Hz, space={f_space} Hz, sample_rate={sample_rate}"
    )
    print("Press Ctrl‑C to stop.")

    try:
        with sd.InputStream(
            channels=1,
            samplerate=sample_rate,
            callback=audio_callback,
            blocksize=samples_per_bit,  # deliver roughly bit‑sized blocks
        ):
            while True:
                # Wait for next chunk from audio thread
                new_samples: np.ndarray = audio_q.get()
                sample_buffer = np.concatenate((sample_buffer, new_samples))

                # Process while we have at least one full bit period
                while len(sample_buffer) >= samples_per_bit:
                    chunk = sample_buffer[:samples_per_bit]
                    sample_buffer = sample_buffer[samples_per_bit:]

                    mag_mark = get_fft_magnitude_at_freq(chunk, sample_rate, f_mark)
                    mag_space = get_fft_magnitude_at_freq(chunk, sample_rate, f_space)

                    bits.append(1 if mag_mark > mag_space else 0)

                    # Attempt to extract bytes whenever we have plenty of bits
                    while len(bits) >= 10:
                        # Search for start bit (0)
                        if bits[0] != 0:
                            bits.pop(0)
                            continue

                        frame = bits[:10]
                        if frame[9] != 1:
                            # Bad stop bit – discard first bit and resync
                            bits.pop(0)
                            continue

                        # Convert 8 data bits (LSB first) to byte
                        byte_val = 0
                        for i, b in enumerate(frame[1:9]):
                            byte_val |= b << i
                        # Print byte
                        if 32 <= byte_val < 127:
                            sys.stdout.write(chr(byte_val))
                            sys.stdout.flush()
                        else:
                            sys.stdout.write(f"<{byte_val:02X}>")
                            sys.stdout.flush()
                        # Remove processed bits
                        bits = bits[10:]

    except KeyboardInterrupt:
        print("\nStopped by user.")

# ---------------- Main -------------------------------------------------------

if __name__ == "__main__":
  
    BAUD = 1200
    SPACE_FREQ = 1200
    MARK_FREQ = 2200

    SAMPLE_RATE = 48000

    decode_afsk_stream(baud=BAUD, f_space=SPACE_FREQ, f_mark=MARK_FREQ, sample_rate=SAMPLE_RATE)