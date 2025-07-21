# Oasis

Oasis is a **free, open-source, encrypted, peer-to-peer, distributed (not decentralized!) & federated**... project networking application 
that helps you follow interesting content and discover new ones.

  ![SNH](https://solarnethub.com/git/snh-oasis-logo3.jpg "SolarNET.HuB")

Oasis redefines what it means to be connected in the modern world, giving people 
the ability to control their online presence and interactions without the need for centralized institutions.

----------

## Frontend:

Main features of the Oasis interface are:

 +  Data manipulation is not permitted due to the use of BLOCKCHAIN technology.
 +  No browser JavaScript. Just pure HTML+CSS. A really secure frontend!.
 +  Use your favorite web browser to read and write messages to the people you care about.
 +  Strong cryptography in every single point of the network.
 +  You are the center of your own distributed network. Online or offline, it works anywhere that you are.
 +  Initial identities are randomnly generated (no username or password required).
 +  No personal profile generated (no questions about gender, age, location, etc …).
 +  Automatic exif stripping (such as GPS coordinates) on images for better privacy.
 +  No email or associated mobile phone required.
 +  Automatic updates with new functionalities.
 
   ![SNH](https://solarnethub.com/git/snh-oasis-settings.png "SolarNET.HuB")
      
But it has others features that are also really interesting, for example:

 +  Support for multiple languages.
 
   ![SNH](https://solarnethub.com/git/snh-oasis-languages.png "SolarNET.HuB")

 +  Modularity to set your own environment.
 
   ![SNH](https://solarnethub.com/git/snh-oasis-modules.png "SolarNET.HuB")
    
 +  Support for multiple themes.
 
   ![SNH](https://solarnethub.com/git/snh-clear-theme.png "SolarNET.HuB")
   ![SNH](https://solarnethub.com/git/snh-purple-theme.png "SolarNET.HuB")
   ![SNH](https://solarnethub.com/git/snh-matrix-theme.png "SolarNET.HuB")
 
And much more, that we invite you to discover by yourself ;-)

----------

## Modules:

Oasis is TRULY MODULAR. Here's a list of what comes deployed with the "core".

 + Agenda: Module to manage all your assigned items.
 + AI: Module to talk with a LLM called '42'.
 + Audios: Module to discover and manage audios.
 + Bookmarks: Module to discover and manage bookmarks.	
 + Cipher: Module to encrypt and decrypt your text symmetrically (using a shared password).	
 + Documents: Module to discover and manage documents.	
 + Events: Module to discover and manage events.	
 + Feed: Module to discover and share short-texts (feeds).	
 + Governance: Module to discover and manage votes.	
 + Images: Module to discover and manage images.	
 + Invites: Module to manage and apply invite codes.	
 + Legacy: Module to manage your secret (private key) quickly and securely.	
 + Latest: Module to receive the most recent posts and discussions.
 + Market: Module to exchange goods or services.
 + Multiverse: Module to receive content from other federated peers.	
 + Opinions: Module to discover and vote on opinions.	
 + Pixelia: Module to draw on a collaborative grid.	
 + Popular: Module to receive posts that are trending, most viewed, or most commented on.	
 + Reports: Module to manage and track reports related to issues, bugs, abuses, and content warnings.	
 + Summaries: Module to receive summaries of long discussions or posts.	
 + Tags: Module to discover and explore taxonomy patterns (tags).	
 + Tasks: Module to discover and manage tasks.	
 + Threads: Module to receive conversations grouped by topic or question.	
 + Transfers: Module to discover and manage smart-contracts (transfers).	
 + Trending: Module to explore the most popular content.	
 + Tribes: Module to explore or create tribes (groups).	
 + Videos: Module to discover and manage videos.	
 + Wallet: Module to manage your digital assets (ECOin).	
 + Topics: Module to receive discussion categories based on shared interests.

Both the codebase and the inhabitants can generate new modules.

----------

## C-AI (collective artificial intelligence)

Oasis contains its own AI model called "42". 

The main idea behind this implementation is to enable distributed learning generated through the collective action of many individuals, with the goal of redistributing the necessary processing load, as well as the ecological footprint and corporate bias.

  ![SNH](https://solarnethub.com/git/oasis-ai-example.png "SolarNET.HuB")

Our AI is trained with content from the OASIS network and its purpose is to take action and obtain answers to individual, but also global, problems.

 + https://wiki.solarnethub.com/socialnet/ai

----------

## ECOin (crypto-economy)

Oasis contains its own cryptocurrency. With it, you can exchange items and services in the marketplace. 

  ![SNH](https://solarnethub.com/git/oasis-tomatoes-example.png "SolarNET.HuB")

You can also receive a -Universal Basic Income- if you contribute to the Tribes and their coordinated actions.

 + https://ecoin.03c8.net

----------

## L.A.R.P.

Oasis contains a L.A.R.P. (real action role-playing) structured around 1+8 main houses. 

  ![SNH](https://solarnethub.com/git/oasis-larp-schema.jpg "SolarNET.HuB")

The main objective is to empower the inhabitants to organize around specific proposals and generate federated governments with specific characteristics.

 + https://wiki.solarnethub.com/socialnet/roleplaying#how_to_play
 
Check "The Houses" to review which one fit better with your ambitions:

 + https://wiki.solarnethub.com/socialnet/roleplaying#the_houses

----------
  
## Invite codes (for PUBs and TRIBES):

Oasis is a TRUSTNET. This means you need an invitation code to enter the PUBs (managed by inhabitants or hacklabs).

Similarly, TRIBES (groups in Oasis) require an entry code.

  ![SNH](https://solarnethub.com/git/snh-oasis-invites.png "SolarNET.HuB")
  
While you can use it and connect to any nodes you want, it's a good idea to get an entry code to connect with the community.

So you'll need to know someone, or participate in a collective action that distributes invitation codes, to see everything.

 + https://wiki.solarnethub.com/socialnet/snh#finding_inhabitants
  
----------

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

----------

## Backend:

Oasis is based on a mesh network and self-hosted social media ecosystem called Secure Scuttlebutt (SSB). 

SSB uses a blockchain like append-only data structure and a fully decentralized P2P network. There are no servers or authorities 
of any kind. Like a crypto transaction, SSB posts are censorship-resistant and are replicated to the entire network.

  ![SNH](https://solarnethub.com/git/ssb-participants-perspective.png "SolarNET.HuB")

In SSB each user hosts their own content and the content of the peers they follow, which provides fault tolerance and 
eventual consistency. 

----------

## Installing:

Follow ['INSTALL.md'](docs/install/install.md) to build and install it on your device.

----------

## Setup & Deploy:

Visit ['Settings'](https://wiki.solarnethub.com/socialnet/snh#settings_minimal) to learn how to choose your language, set a theme & configure your avatar.

----------

## Multiverse:

Join ['PUB: "La Plaza"'](https://wiki.solarnethub.com/socialnet/snh-pub) to start to be connected with other interesting projects in the Multiverse.

  ![SNH](https://solarnethub.com/git/snh-oasis_federation-2.png "SolarNET.HuB")
  
This allows you to communicate and access content from outside the [project network](https://wiki.solarnethub.com/socialnet/overview). 

  ![SNH](https://solarnethub.com/git/snh-multiverse.png "SolarNET.HuB")

----------

## SNH-Hub (for HackLabs):

The public content of the ['PUB: "La Plaza"'](https://wiki.solarnethub.com/socialnet/snh-pub) can be visited from outside the [project network](https://wiki.solarnethub.com/socialnet/overview), through the [World Wide Web](https://en.wikipedia.org/wiki/World_Wide_Web) (aka [Clearnet](https://en.wikipedia.org/wiki/Clearnet_(networking))).

  ![SNH](https://solarnethub.com/git/snh-pub-feed.png "SolarNET.HuB") 
  
Just visit: https://pub.solarnethub.com/

  ![SNH](https://solarnethub.com/git/snh-pub-laplaza.png "SolarNET.HuB")
  
And also you can visit periodically the public statistic of the SNH-PUB:

  ![SNH](https://solarnethub.com/git/snh-pub-stats.png "SolarNET.HuB")
  
See stats: https://laplaza.solarnethub.com/

----------

## Roadmap:

Review ['Roadmap'](https://wiki.solarnethub.com/project/roadmap#the_project_network) to know about some required functionalities that can be implemented.

----------

## Translations:

Oasis supports multiple languages. One way to contribute is to translate the interface into your language so other people in your region can use it more intuitively.

 + https://wiki.solarnethub.com/socialnet/snh#choose_language

----------

## Development:

Oasis is completely coded in: node.js, HTML5 + CSS.

Check ['Call 4 Hackers'](https://wiki.solarnethub.com/community/hackers) for contributing with developments.

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
 + THS: https://thehackerstyle.com
