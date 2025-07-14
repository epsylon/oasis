
ECOin - Copyright (c) - 2014/2025 - GPLv3 - epsylon@riseup.net (https://ecoin.03c8.net)

===========================================
# SOURCES for P2P Crypto-Currency (ECOin) #
===========================================

Testing machine is: Debian GNU/Linux 12 (bookworm) (x86_64).

All of the commands should be executed in a shell.

------------------------------

(0.) Clone the github tree to get the source code:

  + Official:

	git clone http://code.03c8.net/epsylon/ecoin

  + Mirror:

	git clone https://github.com/epsylon/ecoin

------------------------------

===================================================
# SERVER -ecoind- for P2P Crypto-Currency (ECOin) #
===================================================

(0.) Version libraries:

    - Libboost -> source code 1.68 provided at: src/boost_1_68_0

(1.) Install dependencies:

    sudo apt-get install build-essential libssl-dev libssl3 libdb5.3-dev libdb5.3++-dev libleveldb-dev miniupnpc libminiupnpc-dev

        + Optionally install qrencode (and set USE_QRCODE=1):

       	    sudo apt-get install libqrencode-dev

(2.) Now you should be able to build ecoind:

    cd src/
    make -f makefile.linux USE_UPNP=- USE_IPV6=-
    strip ecoind

    An executable named 'ecoind' will be built.
    
    Now you can launch: ./ecoind to run your ECOin server.

------------------------------

============================================
# WALLET for P2P Crypto-Currency (ECOin)  #
============================================

(0.) Version libraries:

    - Libboost -> source code 1.68 provided at: src/boost_1_68_0

(1.) First, make sure that the required packages for Qt5 development (an the others required for building the daemon) are installed:

    sudo apt-get install qt5-qmake qtbase5-dev build-essential libssl-dev libssl3 libdb5.3-dev libdb5.3++-dev libleveldb-dev miniupnpc libminiupnpc-dev
        
        + Optionally install qrencode (and set USE_QRCODE=1):

       	    sudo apt-get install libqrencode-dev

(2.) Then execute the following:

    qmake USE_UPNP=- USE_IPV6=-
    make

    An executable named 'ecoin-qt' will be built.
    
    Now you can launch: ./ecoin-qt to run your ECOin wallet/GUI.
       
------------------------------   
========================================
+ CPU MINER for ECOin (Unix/GNU-Linux) #
========================================

See doc/MINING.txt for detailed instructions on running /ecoin-miner/ on different platforms.

  + GNU/Linux:

	cd miner/
	sh build.sh
	
    An executable named 'cpuminer' will be built.
     
    Now you can launch: ./cpuminer to run your ECOin PoW miner.

======================================

For a list of command-line options:

  ./ecoind --help

To start the ECOin daemon:

  ./ecoind -daemon

For ECOin-QT Wallet

  ./ecoin-qt
 
For debugging:

  tail -f /home/$USER/.ecoin/debug.log

======================================


