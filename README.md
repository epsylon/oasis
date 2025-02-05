# Oasis

Oasis is a **free, open-source, encrypted, peer-to-peer, distributed & federated**... project networking application 
that helps you follow interesting content and discover new ones.

Check ['Overview`](https://wiki.solarnethub.com/socialnet/overview) for more info.

  ![SNH](https://solarnethub.com/git/snh-oasis-logo.jpg "SolarNET.HuB")

Oasis redefines what it means to be connected in the modern world, giving people 
the ability to control their online presence and interactions without the need for centralized institutions. 

## Architecture:

Oasis uses a gossip protocol or epidemic protocol which is a procedure or process of computer peer-to peer communication 
that is based on the way epidemics spread.

  ![SNH](https://solarnethub.com/git/snh-meshnet.png "SolarNET.HuB")

This means that information is able to distribute across multiple machines, without requiring direct connections between them. 

  ![SNH](https://solarnethub.com/git/gossip-graph1.png "SolarNET.HuB")

Even though Alice and Dan lack a direct connection, they can still exchange feeds: 

  ![SNH](https://solarnethub.com/git/gossip-graph2.png "SolarNET.HuB")
 
This is because gossip creates “transitive” connections between computers. Dan's messages travel through Carla and the PUB 
to reach Alice, and visa-versa. 

## Backend:

Oasis is based on a mesh network and self-hosted social media ecosystem called Secure Scuttlebutt (SSB). 

SSB uses a blockchain like append-only data structure and a fully decentralized P2P network. There are no servers or authorities 
of any kind. Like a crypto transaction, SSB posts are censorship-resistant and are replicated to the entire network.

  ![SNH](https://solarnethub.com/git/ssb-participants-perspective.png "SolarNET.HuB")

In SSB each user hosts their own content and the content of the peers they follow, which provides fault tolerance and 
eventual consistency. 

## Frontend:

Main features of the Oasis interface are:

 +  No browser JavaScript. Just pure HTML+CSS. A really secure frontend!.
 +  Use your favorite web browser to read and write messages to the people you care about.
 +  Strong cryptography in every single point of the network.
 +  You are the center of your own distributed network. Online or offline, it works anywhere that you are.
 +  Initial identities are randomnly generated (no username or password required).
 +  No personal profile generated (no questions about gender, age, location, etc …).
 +  Automatic exif stripping (such as GPS coordinates) on images for better privacy.
 +  No email or associated mobile phone required.
 +  Support for multiple languages.
 +  Automatic updates with new functionalities.
 
   ![SNH](https://solarnethub.com/git/snh-oasis-settings.png "SolarNET.HuB")
      
But it has others features that are also really interesting, for example:

 +  Modularity to set your own environment.
 
   ![SNH](https://solarnethub.com/git/snh-oasis-modules.png "SolarNET.HuB")
     
 +  A wallet to manage your ECOIn assets directly on the network.
 
   ![SNH](https://solarnethub.com/git/snh-oasis-ecoin.png "SolarNET.HuB")
    
 +  A client side robust encryption (aes-256-cbc) to encrypt/decrypt your messages, even on the semantic layer.

   ![SNH](https://solarnethub.com/git/snh-oasis-cipher.png "SolarNET.HuB")
   
And much more, that we invite you to discover by yourself.

----------

## Installing:

Follow ['INSTALL.md'](docs/install.md) to build and install it on your device.

----------

## Setup:

Visit ['Settings'](https://wiki.solarnethub.com/socialnet/snh#settings_minimal) to learn how to choose your language, set a theme & configure your avatar.

----------

## Multiverse:

Join ['PUB: "La Plaza"'](https://wiki.solarnethub.com/socialnet/snh-pub) to start to be connected with other interesting projects in the Multiverse.

  ![SNH](https://solarnethub.com/git/snh-oasis_federation-2.png "SolarNET.HuB")
  
This allows you to communicate and access content from outside the [project network](https://wiki.solarnethub.com/socialnet/overview). 

  ![SNH](https://solarnethub.com/git/snh-multiverse.png "SolarNET.HuB")

----------

## SNH-Hub:

The public content of the ['PUB: "La Plaza"'](https://wiki.solarnethub.com/socialnet/snh-pub) can be visited from outside the [project network](https://wiki.solarnethub.com/socialnet/overview), through the [World Wide Web](https://en.wikipedia.org/wiki/World_Wide_Web) (aka [Clearnet](https://en.wikipedia.org/wiki/Clearnet_(networking))).

  ![SNH](https://solarnethub.com/git/snh-pub-feed.png "SolarNET.HuB") 
  
Just visit: https://pub.solarnethub.com/

  ![SNH](https://solarnethub.com/git/snh-pub-laplaza.png "SolarNET.HuB")
  
And also you can visit periodically the public statistic of the SNH-PUB:

  ![SNH](https://solarnethub.com/git/snh-pub-stats.png "SolarNET.HuB")
  
See stats: https://laplaza.solarnethub.com/

----------

## Development:

Oasis is completely coded in: node.js (v22.13.1), HTML5 + CSS.

Check ['Call 4 Hackers'](https://wiki.solarnethub.com/community/hackers) for contributing with developments.

----------

## Roadmap:

Review ['Roadmap'](https://wiki.solarnethub.com/project/roadmap#the_project_network) to know about some required functionalities that can be implemented.

----------

## Links:

 + SNH Website: https://solarnethub.com
 + Kräkens.Lab: https://krakenslab.com
 + Documentation: https://wiki.solarnethub.com
 + Forum: https://forum.solarnethub.com
 + Research: https://wiki.solarnethub.com/docs/research
 + Code of Conduct: https://wiki.solarnethub.com/docs/code_of_conduct
 + The KIT: https://wiki.solarnethub.com/kit/overview
 + Ecosystem: https://wiki.solarnethub.com/socialnet/ecosystem
 + Project Network: https://wiki.solarnethub.com/socialnet/snh#the_project_network
 + ECOin: https://wiki.solarnethub.com/ecoin/overview
 + Role-playing (L.A.R.P): https://wiki.solarnethub.com/socialnet/roleplaying
 + Warehouse: https://wiki.solarnethub.com/stock/submit_request
