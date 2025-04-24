import numpy as np
import wave
import struct

# Parameters
mark_freq = 1200       # Hz (bit 1)
space_freq = 2200      # Hz (bit 0)
baud_rate = 50         # bits per second
sample_rate = 48000    # samples per second
preamble_duration = 1  # seconds

# Message to encode
message = "$$$??????###"

# Convert message to bit string (LSB first per byte)
def ascii_to_bits_lsb_first(msg):
    return ''.join(f"{ord(c):08b}"[::-1] for c in msg)

bit_string = ascii_to_bits_lsb_first(message)

# Optional: Add preamble of alternating bits ("101010...")
preamble_bits = "10101010" * int((preamble_duration * baud_rate) / 8)
full_bits = preamble_bits + bit_string

# Generate AFSK waveform
samples_per_bit = int(sample_rate / baud_rate)
waveform = np.array([], dtype=np.float32)

for bit in full_bits:
    freq = mark_freq if bit == '1' else space_freq
    t = np.arange(samples_per_bit) / sample_rate
    tone = np.sin(2 * np.pi * freq * t)
    waveform = np.concatenate((waveform, tone))

# Normalize to int16 range
waveform_int16 = np.int16(waveform / np.max(np.abs(waveform)) * 32767)

# Save to .wav file
output_filename = "afsk_50baud_message.wav"
with wave.open(output_filename, 'w') as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)  # 16-bit
    wf.setframerate(sample_rate)
    wf.writeframes(struct.pack('<' + 'h' * len(waveform_int16), *waveform_int16))

print(f"AFSK audio saved to '{output_filename}' with message: {message}")
