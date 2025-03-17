# 🐾 FA Gallery Downloader DX 🐾

### Dead simple gallery download for FurAffinity
### Originally created by SpottedSqueak.

*Thank you SpottedSqueak for your contributions to the furry fandom.
Rest in peace* 🐁🌼

## Contributing
Contributions to maintaining this are accepted, please make a pull request if you would like to contribute.

---
### [> Download Latest Release <](https://github.com/ItsAlphaNeon/FA-Gallery-Downloader-DX/releases)
---
## Dev Info

Install: `npm i`

Run: `npm run start`

Build: `npm run build`

Database is `sqlite` and can be read with something like [DB Browser](https://sqlitebrowser.org/)

## Info

You login, type in an FA username, pick your options, and go. It will display download progress, and any messages associated with the download. You can stop and resume later at any point. 

The gallery information is saved in the containing folder under `fa_gallery_downloader`, with all content saved in `/fa_gallery_downloader/downloaded_content` folder, placed in the same folder as the executable. The database has all of the related submission metadata.

You can browse via the file system, or the *slick built-in replica-FA gallery viewer.* It's up to you!

***NOTE:*** You'll need a **valid, up-to-date Chromium/Chrome install** for this to work. If you do not have one, the program will download the latest Chromium build for you, much like [Electron](https://www.electronjs.org/) does. I don't download it by default to save bandwidth and time (and most folks have some version of it installed already).

***Why is a browser needed?*** A lot of users have their galleries hidden from site visitors, so this is the easiest way to consistently ensure access to galleries. This is done almost the exact same way [Postybirb](https://www.postybirb.com/) does it! Futhermore, the login is used to determine if the gallery you're downloading is one that you own, for future uploading to other sites via Postybirb importing.

You'll need [@radically-straightforward/package](https://github.com/radically-straightforward/radically-straightforward/tree/main/package) to build the application bundle for your OS. The resulting zip/gzip file will be a sibling of the extracted folder. Note that it will copy ALL files in the current directory, so you might want to copy only the files needed (no `.git` files or the entire `fa_gallery_downloader` folder) and run the build command in that folder instead. Or just download the latest Release, whatever's easiest.


## How it works

Start the program, login, choose a gallery and go. It will then walk through the gallery, first the main gallery and then scraps, collecting all of the submission links present. Once complete, it will start visiting and collecting metadata (title, description, tags, etc.) for each submission, as well as queuing staggered downloads of the content for each submission. I do this to prevent being blocked on FA's site.

The downloaded submissions can be found in the `/fa_gallery_downloader/downloaded_content` folder, placed in the same folder as the executable.

It supports resuming, as it can take upwards of half an hour to fully download large galleries (possibly more).

I hope it helps, it's always a good idea to not put all your eggs in one basket.

## Exporting to Postybirb

First off, you'll need to log in to an FA account to be able to export it! Once you do, you can simply click the `Export` button next to the username on the startup menu, and all currently downloaded/saved submissions will be exported to a folder with the following structure, where each folder represents 50 submissions:
```
.
└── fa_gallery_downloader/
    └── exports/
        └── [account name]/
            ├── 0
            ├── 1
            ├── 2
            ├── 3
            ├── 4
            └── (etc...)
```
You'll need to import *each numbered directory* into Postybirb; Postybirb's directory importer had issues with handling more than 50 submissions at a time, hence this system.

***NOTE:*** If you do not want to include the **"originally posted on"** date in the imported description in Postybirb, make sure to uncheck that option below the `Export` button.
