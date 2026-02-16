# YTRelay

A tiny api wrapper around yt-dlp, originally designed to be used with the [glacier project](https://github.com/RA341/glacier).

## Features

Fully stocked up docker image

The docker image includes all dependencies needed by yt-dlp to function without limits

* FFmpeg
* bun for JS runtime
* yt-ejs

## Usage

The server exposes a single endpoint

Simply send the URL you want to download, and returns the downloaded file and caches it for 30 min.

```
http://localhost:3000/download?url=<your download url>
```

Optionally set the `API_KEY` env to prevent unauthorized requests

With the `API_KEY` add a `X-Api-Key`=<your api key> header to your requests

## Dev

To install dependencies:
```sh
bun install
```

To run:
```sh
bun run dev
```

```
open http://localhost:3000
```
