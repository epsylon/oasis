# Oasis Installation Guide

This guide will walk you through the process of installing **Oasis** on your device. 

You can either use the automated installation script or manually download the source code.

---

## 1) Automated Installation (Recommended)

To install **Oasis** with a single command, run: 

    sh install.sh

---

## 2) Manual Installation 

### dependencies

You need 
* curl
* node 22.21.1
* git

on debian you can install the following:

``` bash
sudo apt-get install git curl
curl -sL http://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt-get install -y nodejs
```

### install it
Try to execute the following steps (from a shell):

``` bash
git clone https://code.03c8.net/KrakensLab/oasis
cd oasis
npm install .
```
---

## 3) Run Oasis

To run **Oasis** just launch: 

    sh oasis.sh
