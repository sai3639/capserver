import sounddevice as sd
import numpy as np
from scipy.signal import butter, lfilter
from scipy.fftpack import fft
import matplotlib.pyplot as plt
import requests
import sys
import time
import signal
import traceback
import os
from datetime import datetime
import codecs


DEVICE_INDEX = 24

sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())

#44100 hz sample rate - audio signal recorded 44100 times per sec
    #common rate used in digital audio 
    #allows recording freq up to 22050 hz 


#higher order - increases sharpness - reducing unwanted frequencies
    #increaes computation time, phase distortion, oscillations in time domain - cant go too high

# Bandpass filter isolates audio frequencies (AFSK tones: 1200 Hz & 2200 Hz)
#sample rate - 44100 Hz
#order - controls filter sharpness

# Global variables
audio_data = []
recording = False
stream = None #audio input stream using sounddevice- used to capture audio real time from mic

def signal_handler(signum, frame):
    global recording, stream
    print(f"Received signal {signum}")
    recording = False
    

signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

def bandpass_filter(data, lowcut, highcut, sample_rate, order=6):
       #maximum freq that can be represented in digital signal; normalizes filter cutoff frequencies
    nyquist = 0.5 * sample_rate#nyquist frequency - half of sample rate
    #normalizes target frequencies
    low, high = lowcut / nyquist, highcut / nyquist#butter function expects normalized frequencies in range 0,1
        #designs 6th order bandpass filter

    b, a = butter(order, [low, high], btype='band')
    return lfilter(b, a, data) # apply filter


def normalize_audio(audio_data):
    if len(audio_data) == 0:
        return audio_data
    max_val = np.max(np.abs(audio_data))
    if max_val > 0:
        return audio_data / max_val
    return audio_data

# Goertzel Algorithm for frequency detection
#detects signle freq in signal
#detects power of a target frequency in chunck of audio
def goertzel(samples, sample_rate, target_freq):
    # number of samples in input ssignal segment
    N = len(samples)
    window = np.hamming(N)
    samples = samples * window
    #computes bin index corresponding to target_freq 
    #(N* target_freq / sample_rate) = maps target freq to discrete freq bin
    k = int(0.5 + (N * target_freq / sample_rate))
    #goertel freq bin index
    omega = (2.0 * np.pi * k) / N
    coeff = 2.0 * np.cos(omega) #computes recurrence coefficient used in Goertzel recurision
    #store immediate values in recurrence relation
    s1, s2 = 0.0, 0.0 #initalizes state variables
    #iterate over samples using goertzel recurrence formula
    for sample in samples:
        s = sample + coeff * s1 - s2
        s2, s1 = s1, s
    power = s2**2 + s1**2 - coeff * s1 * s2 #computes power of target freq
    magnitude = np.sqrt(s2*s2 + s1*s1 - coeff*s1*s2)
        # returnss computed power - indicating how strong target_freq is in the signal
    return magnitude  


# Demodulate AFSK - extract binary data 
#baud rate - speed of data transmission 1200 bits/sec
def demodulate_afsk(audio_data, sample_rate, mark_freq=1200, space_freq=2200, baud_rate=1200):
    #determines how many samples correspond to single data bit
    #*8 - increases chunk size - enhances Goertzel accuracy - change
    #rn 36 samples per bit
    
    samples_per_bit = int(sample_rate / baud_rate) *2
    #divides signal into chunks of size
    binary_data = [] #initializes empty list to store binary bits
    
    audio_data = normalize_audio(audio_data)
    window_size = samples_per_bit *2

    #loop through audio_data in chunks of sample_per_bit size - each iteration process one symbol (bit)
    for i in range(0, len(audio_data) - window_size, samples_per_bit):
        chunk = audio_data[i:i + samples_per_bit]
        #extracts chunck of audio samples corresponding to one bit

        #use goertzel algorithm to measure power at 1200 hz (1) and 2200 hz (0)
        if len(chunk) < samples_per_bit // 2:#if chunck too small - loop stops earlu - near end of signal
            break


        #chunk = chunk - np.mean(chunk)
        #chunk = chunk /(np.max(np.abs(chunk)) + 1e-6)

        
        
        #use goertzel algorithm to measure power at 1200 hz (1) and 2200 hz (0)
        power_mark = goertzel(chunk, sample_rate, mark_freq)
        power_space = goertzel(chunk, sample_rate, space_freq)
        #print(f"Chunk {i}: power_mark = {power_mark}, power_space = {power_space}")

        ratio = power_mark / (power_space + 1e-6)  # Avoid division by zero

       # if ratio > 1.2:  
        #    binary_data.append('1')
        ##   binary_data.append('0')
        print(f"Chunk {i}: Power at 1200 Hz: {power_mark}, Power at 2200 Hz: {power_space}")

        threshold = 1.2

        if power_space > (power_mark * threshold) :
            binary_data.append('0')  
        else:
            binary_data.append('1')

        #compares power levels - if chnck has more  1200 hz - then append 1 else 0
        #binary_data.append('1' if power_mark > power_space else '0')
       # threshold = 0.05  # Adjust this value based on your signal characteristics
       # if power_mark > power_space + threshold:
        #    binary_data.append('1')
       # elif power_space > power_mark + threshold:
        #    binary_data.append('0')
        #else:
         #   binary_data.append('?') 


    return ''.join(binary_data)


#callback for sounddevice audio stream
def audio_callback(indata,status, frames, time):

    global audio_data
    if status:
        print('Error:', status)
        #if recording true - append incoming data to the audio_data list
    if recording:
        indata = indata - np.mean(indata)
        audio_data.extend(indata.flatten()) #flatten - store data as 1D array
       # audio_data = audio_data / np.max(np.abs(audio_data))
        np.save('audio_data.npy', np.array(audio_data)) #data is stored in numpy file 
        #print(f"Captured {len(indata.flatten())} samples, Total: {len(audio_data)}", flush=True)

def start_recording():
    global recording, stream, audio_data

   
    
    print("Starting recording...", flush=True)
    try:

        recording = True
        audio_data = [] #resets audio_data 
        
        # Set up the stream - creates input stream
        stream = sd.InputStream(
            channels=1, #single audio channel
            samplerate=44100, #sampler ate 44.1 kHz
            callback=audio_callback,
            #device = DEVICE_INDEX
        )
        
        
        stream.start() #start audio stream


        print("Recording started successfully", flush=True)

        time.sleep(2) # wait for audio to be captured
 
    #no audio data captured - smth wrong
        if not audio_data:
            print("WARNING: No audio data received! Check microphone access or settings.")

       

        #print(f"Final collected samples before stopping: {len(audio_data)}", flush=True)

        #print("meow", audio_data)

      
        
        # print("Recording loop ended normally")
        
        #error during audio recording
    except Exception as e:
        print(f"Error during recording: {str(e)}")
        recording = False
        #stop and close stream
        if stream:
            try:
                stream.stop()
                stream.close()
            except:
                pass
        print(f"Error during recording: {str(e)}")
        raise e

def stop_recording():
    global recording, stream, audio_data
    
        
    print("Stopping recording...")
   # print(f"Before stopping, collected samples: {len(audio_data)}", flush=True)
    recording = False 
    #print("hi")

    time.sleep(1) # wait to ensure audio data saved

#load numpy file and convert back to python list
    if os.path.exists('audio_data.npy'):
        audio_data = np.load('audio_data.npy', allow_pickle=True).tolist() 
        audio_data = np.array(audio_data)
        if np.max(np.abs(audio_data)) < 1e-6:
            print("Warning: Audio data is too small or zero. Check recording.")
        audio_data = audio_data / np.max(np.abs(audio_data))
        #allow_pickle - numpy can load objects stored using pickle module - good when file contains complex objs like lists
        #ensurs that numpy loads array without errors - was getting error before

    print(f"After sleep, collected samples: {len(audio_data)}", flush=True)


    
    #if steam exists - stop and close it
    
    if stream:
        try:
            stream.stop()
            stream.close()
            print("Stream closed")
            time.sleep(1)
            #return process_audio()
        except Exception as e:
            print(f"Error closing stream: {str(e)}")
            raise e
    return process_audio() # process audio



# Record audio, filter, demodulate, and send to backend

def process_audio():
    global audio_data

    print("check audio:", audio_data)

#if no audio data - nothing to process
    if len(audio_data) == 0:
        print("No audio data to process")
        return
    #convert audio_data to array

    try:
        print("starting audio processing")

        audio_array = np.array(audio_data)

        audio_array = audio_array - np.mean(audio_array)
        audio_array = normalize_audio(audio_array)

        sample_rate = 44100
        

        plt.plot(audio_data[:1000])
        plt.title("Raw Audio Signal")
        plt.show()
        # Apply bandpass filter
            #removes unwanted freq
#call bandpass filter 
        filtered_audio = bandpass_filter(audio_array, 1200, 2200, sample_rate)
        print("Bandpass filter applied")

        plt.plot(filtered_audio[:1000])
        plt.title("Filtered Audio Signal")
        plt.show()
        
        # Calculate FFT
            #fft to visualize freq content
#fast fourier transform 
        fft_data = fft(filtered_audio)
        fft_magnitude = np.abs(fft_data) #extracts magnitude specturm 
        freq_axis = np.linspace(0, sample_rate/2, len(fft_data)//2) #generates frequency axis
        print("FFT calculated")
        
        #make sure that this directory exists 
        os.makedirs('static/plots', exist_ok=True)
        timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S') #creates timestamp = not actually used
        print("time", timestamp)


        # Create and save plots
        #generates frequency plot and spectogram
        plot_filename = f'static/plots/audio_analysis_{timestamp}.png'
        plt.figure(figsize=(12, 8))
        plt.subplot(2, 1, 1)
        plt.plot(freq_axis, np.abs(fft_data[:len(fft_data)//2]))
        plt.subplot(2, 1, 2)
        plt.specgram(filtered_audio, NFFT=1024, Fs=sample_rate)
        plt.savefig(plot_filename)
        plt.close()
        print(f"Plots saved to {plot_filename}")

        
        # Perform AFSK demodulation
        #3xtract binary data from AFSK signal
        demodulated_data = demodulate_afsk(filtered_audio, sample_rate)  # Added sample_rate
        #print(f"Demodulated data length: {len(demodulated_data)}")
        print(f"Binary output before sending to database: {demodulated_data}")
        
        #prepeares data to be sent to server
        data_to_send = {
            'timestamp': timestamp,
            'binaryData': demodulated_data,  
            'plotPath': plot_filename,
            'fftData': fft_magnitude[:len(fft_magnitude)//2].tolist(),
            'freqAxis': freq_axis.tolist()
        }
        
        print("Sending data to server...")
        
        try:
            #sends processed data to server
            response = requests.post('http://localhost:8888/afsk/audio', json=data_to_send)
            response.raise_for_status()
            print(f"Server response status: {response.status_code}")
            print(f"Server response content: {response.content.decode('utf-8', 'ignore')}")

        except requests.exceptions.RequestException as e:
            print(f"Failed to send data: {e}")
            traceback.print_exc()

        print(f"Server response status: {response.status_code}")
        print(f"Server response content: {response.content.decode('utf-8', 'ignore')}")


        
            
    except Exception as e:
        print(f"Error processing audio: {e}")
        traceback.print_exc()
        raise e
    

if __name__ == "__main__":
    #script is executed with either start or stop argument
    if len(sys.argv) != 2:
        print("Usage: python script.py [start|stop]")
        sys.exit(1)

    command = sys.argv[1].strip().lower()
    print(f"Received command: {command}")

    try:
        if command == "start":
            print('about to start recording')
            start_recording() # call start_recording()
            print('recording fuction executed')
        elif command == "stop":
            print('recording stop')
            stop_recording() # call stop_recording()
        else:
            print(f"Unknown command: {command}")
            sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)