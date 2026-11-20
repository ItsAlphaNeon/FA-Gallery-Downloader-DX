// Dropdown choices from FurAffinity's search page (furaffinity.net/search), by their labels as shown on submissions.
const list = (text) => text.split(';');

export const CATEGORIES = [
  { group: 'Visual Art', options: list('3D Models;Artwork (Digital);Artwork (Traditional);Cel Shading;Crafting;Designs;Food / Recipes;Fursuiting;Icons;Mosaics;Photography;Pixel Art;Sculpting;Virtual Photography') },
  { group: 'Animation & Media', options: list('2D Animation;3D Animation;Pixel Animation;Flash;Interactive Media') },
  { group: 'Readable Art', options: list('Story;Poetry;Prose') },
  { group: 'Audio Art', options: list('Music;Podcasts') },
  { group: 'Downloadable', options: list('Skins;Handhelds;Resources') },
  { group: 'Other Stuff', options: list('Adoptables;Auctions;Contests;Current Events;Desktops;Stockart;Screenshots;Scraps;Wallpaper;YCH / Sale;Other') },
];

// FA calls this "Type" on the search page and "Theme" on submissions
export const THEMES = [
  { group: 'General Things', options: list('Abstract;Animal related (non-anthro);Anime;Comics;Doodle;Fanart;Fantasy;Human;Portraits;Scenery;Still Life;Tutorials;Miscellaneous') },
  { group: 'Specialty', options: list('General Furry Art;ABDL;Baby fur;Bondage;Digimon;Fat Furs;Fetish Other;Fursuit;Gore / Macabre Art;Hyper;Hypnosis;Inflation;Macro / Micro;Muscle;My Little Pony / Brony;Paw;Pokemon;Pregnancy;Sonic;Transformation;TF / TG;Vore;Water Sports') },
  { group: 'Music', options: list('Techno;Trance;House;90s;80s;70s;60s;Pre-60s;Classical;Game Music;Rock;Pop;Rap;Industrial;Other Music') },
];

export const SPECIES = [
  { group: 'General', options: list('Airborne Vehicle;Alien (Other);Amphibian (Other);Aquatic (Other);Avian (Other);Bear (Other);Bovine (Other);Canine (Other);Cervine (Other);Dog (Other);Dragon (Other);Equine (Other);Exotic (Other);Feline (Other);Fox (Other);Goo / Slime;Hybrid Species;Inanimate;Insect (Other);Land Vehicle;Mammal (Other);Marsupial (Other);Mustelid (Other);Plant / Fungus;Primate (Other);Reptilian (Other);Robot / Android / Cyborg;Rodent (Other);Sea Vehicle;Taur (Other);Vulpine (Other)') },
  { group: 'Fandom Creations', options: list('Original Species;Fan Species / Character;Aeromorph;Angel Dragon;Avali;Chakat;Citra;Crux;Dracat;Dutch Angel Dragon;Felkin;Ferrin;Jogauni;Langurhali;Nevrean;Protogen;Rexouium;Sergal;Synx;Wickerbeast;Yinglet;Zorgoia') },
  { group: 'Mythological / Fantasy', options: list('Angel;Centaur;Cerberus;Changeling / Shape Shifter;Chimera;Chupacabra;Cockatrice;Daemon;Demon;Displacer Beast;Dragonborn;Drow;Dwarf;Eastern Dragon;Elf;Gargoyle;Goblin;Golem;Gryphon;Harpy;Hellhound;Hippogriff;Hobbit;Hydra;Imp;Incubus;Jackalope;Kirin;Kitsune;Kobold;Lamia;Manticore;Minotaur;Naga;Nephilim;Orc;Pegasus;Peryton;Phoenix;Sasquatch;Satyr;Sphinx;Succubus;Tiefling;Troll;Unicorn;Water Dragon;Werewolf / Lycanthrope;Western Dragon;Wyvern;Yokai') },
  { group: 'Games / Media', options: list("Alicorn (MLP);Argonian;Asari;Bangaa;Bubble Dragon;Burmecian;Charr;Chiss;Chocobo;Deathclaw;Digimon;Draenei;Drell;Elcor;Ewok;Hanar;Hrothgar;Iksar;Kaiju / Giant Monster;Kelpie;Kemonomimi;Khajiit;Koopa;Krogan;Lombax;Mimiga;Mobian;Moogle;Neopet;Nu Mou;Pokemon;Pony (MLP);Protoss;Quarian;Ronso;Salarian;Sangheili / Elites;Tauntaun;Tauren;Trandoshan;Transformer;Turian;Twi'lek;Viera;Wookiee;Xenomorph;Yautja / Predator;Yordle;Yoshi;Zerg") },
  { group: 'Animal Kingdom', options: list('Aardvark;Aardwolf;African Wild Dog;Akita;Albatross;Alligator / Crocodile;Alpaca;Anaconda;Anteater;Antelope;Arachnid;Arctic Fox;Armadillo;Axolotl;Baboon;Badger;Bat;Beaver;Bee;Binturong;Bison;Blue Jay;Border Collie;Brown Bear;Buffalo;Buffalo / Bison;Bull Terrier;Butterfly;Caiman;Camel;Capybara;Caribou;Caterpillar;Cephalopod;Chameleon;Cheetah;Chicken;Chimpanzee;Chinchilla;Chipmunk;Civet;Clouded Leopard;Coatimundi;Cockatiel;Corgi;Corvid;Cougar / Puma;Cow;Coyote;Crab;Crane;Crayfish;Crow;Crustacean;Dalmatian;Deer;Dhole;Dingo;Dinosaur;Doberman;Dolphin;Donkey / Mule;Duck;Eagle;Eel;Elephant;Falcon;Fennec;Ferret;Finch;Fish;Flamingo;Fossa;Frog;Gazelle;Gecko;Genet;German Shepherd;Gibbon;Giraffe;Goat;Goose;Gorilla;Gray Fox;Great Dane;Grizzly Bear;Guinea Pig;Hamster;Hawk;Hedgehog;Heron;Hippopotamus;Honeybee / Bumblebee;Horse;Housecat;Human;Humanoid;Hummingbird;Husky;Hyena;Iguana;Impala;Jackal;Jaguar;Kangaroo;Kangaroo Mouse;Kangaroo Rat;Kinkajou;Kit Fox;Koala;Kodiak Bear;Komodo Dragon;Labrador;Lemur;Leopard;Liger;Linsang;Lion;Lizard;Llama;Lobster;Longhair Cat;Lynx;Magpie;Maine Coon;Malamute;Mammal - Feline;Mammal - Herd;Mammal - Marsupial;Mammal - Mustelid;Mammal - Other Predator;Mammal - Prey;Mammal - Primate;Mammal - Rodent;Manatee;Mandrill;Maned Wolf;Mantid;Marmoset;Marten;Meerkat;Mink;Mole;Mongoose;Monitor Lizard;Monkey;Moose;Moth;Mouse;Musk Deer;Musk Ox;Newt;Ocelot;Octopus;Okapi;Olingo;Opossum;Orangutan;Orca;Oryx;Ostrich;Otter;Owl;Panda;Pangolin;Panther;Parakeet;Parrot / Macaw;Peacock;Penguin;Persian Cat;Pig / Swine;Pigeon;Pika;Pine Marten;Platypus;Polar Bear;Pony;Poodle;Porcupine;Porpoise;Procyonid;Puffin;Quoll;Rabbit / Hare;Raccoon;Rat;Ray;Red Fox;Red Panda;Reindeer;Reptillian;Rhinoceros;Robin;Rottweiler;Sabercats;Sabertooth;Salamander;Scorpion;Seagull;Seahorse;Seal;Secretary Bird;Serpent Dragon;Serval;Shark;Sheep;Shiba Inu;Shorthair Cat;Shrew;Siamese;Sifaka;Silver Fox;Skunk;Sloth;Snail;Snake / Serpent;Snow Leopard;Sparrow;Squid;Squirrel;Stoat;Stork;Sugar Glider;Sun Bear;Swan;Swift Fox;Tanuki;Tapir;Tasmanian Devil;Thylacine;Tiger;Toucan;Turtle / Tortoise;Vulture;Wallaby;Walrus;Wasp;Weasel;Whale;Wolf;Wolverine;Zebra') },
];

export const DATE_RANGES = [
  ['1day', '1 Day'], ['3days', '3 Days'], ['7days', '7 Days'],
  ['30days', '30 Days'], ['90days', '90 Days'], ['1year', '1 Year'],
  ['3years', '3 Years'], ['5years', '5 Years'], ['all', 'All Time'],
  ['manual', 'Manual'],
];

export const SUBMISSION_TYPES = [
  ['art', 'Art'], ['music', 'Music'], ['flash', 'Flash'], ['story', 'Story'],
  ['photo', 'Photos'], ['poetry', 'Poetry'], ['video', 'Video'],
];

export const MATCH_MODES = [
  ['all', 'All of the words'], ['any', 'Any of the words'], ['extended', 'Extended (see "Help" above)'],
];
