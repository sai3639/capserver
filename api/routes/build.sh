#!/usr/bin/env bash

apt-get update && apt-get install -y portaudio19-dev

# Then continue with your Python setup
pip install -r requirements.txt
