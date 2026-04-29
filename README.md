# 🐾 FA Gallery Downloader DX 🐾

> **⚠️ Notice**
>
> FurAffinity has implemented aggressive Cloudflare Turnstile protection that hinders our scraping method. This project may not function reliably until a workaround is found. If you have a solution that can be implemented in an open-source manner, please submit a pull request.

---

**A streamlined gallery downloader for FurAffinity.**

Originally created by **SpottedSqueak**.

*Thank you for your contributions to the furry fandom. Rest in peace.* 🐁🌼

---

## [Download Latest Release](https://github.com/ItsAlphaNeon/FA-Gallery-Downloader-DX/releases)

---

## Features

- Login with your FA account and download any user's gallery
- Tracks progress and supports pause/resume
- Stores submission metadata in a local SQLite database
- Includes a built-in gallery viewer that mirrors the FA interface
- Resumes downloads if the application is closed or crashes

## Requirements

A valid, up-to-date **Chromium or Chrome installation** is required. If one isn't detected, the program will automatically download the latest Chromium build.

> **Why a browser?** Many users restrict gallery visibility to logged-in visitors. Chromium integration ensures consistent access—similar to how [Postybirb](https://www.postybirb.com/) handles authentication.

## Usage

1. Launch the application and log in
2. Enter a FurAffinity username
3. Select your download options and start

Downloaded content is saved to `./fa_gallery_downloader/downloaded_content`, with all metadata stored in the accompanying SQLite database (viewable with tools like [DB Browser](https://sqlitebrowser.org/)).

## Development

```bash
npm install      # Install dependencies
npm run start    # Run in development mode
npm run build    # Build for production
```

Building requires [@radically-straightforward/package](https://github.com/radically-straightforward/radically-straightforward/tree/main/package). Note that the build process copies all files in the working directory—consider isolating source files before packaging.

## How It Works

The downloader walks through the target gallery (main gallery, then scraps), collecting submission links. It then retrieves metadata and queues staggered downloads to avoid rate limiting. Large galleries may take 30+ minutes to fully process.

---

## Contributing

Contributions are welcome. Please submit a pull request if you'd like to help maintain or improve this project.
