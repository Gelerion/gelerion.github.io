# gelerion.github.io

This is a personal tech blog built with Hugo using the BeautifulHugo theme.

## Prerequisites

* Git
* [Hugo](https://gohugo.io/getting-started/installing/) (v0.80+ recommended)  
* (Optional) Homebrew (on macOS) or your favorite package manager

## Installation

1.  Clone the repository with submodules:
    ```bash
    git clone --recurse-submodules https://github.com/Gelerion/gelerion.github.io.git &&
    cd gelerion.github.io
    ```
2.  Initialize/update submodules (if you didn’t use `--recurse-submodules`):
    ```bash
    git submodule update --init --recursive
    ```

## Running Locally

1.  Start the Hugo development server:
    ```bash
    hugo server -D
    ```
2.  Open [`http://localhost:1313`](http://localhost:1313) in your browser. The `-D` flag includes draft posts.

## Theme

This site uses the `beautifulhugo` theme located in `themes/beautifulhugo`. Theme settings live in `config.toml` under the `theme` and `[params]` sections.

## Adding Content

1.  To create a new post:
    ```bash
    hugo new posts/my-first-post.md
    ```
2.  Edit the new file in `content/posts/`.
3.  Adjust the front matter (TOML/YAML) for title, date, draft, etc.

## Customizing the Theme

* **Override layouts or partials:** Copy files from `themes/beautifulhugo/layouts/` into your site’s `layouts/` directory and edit them.
* **Static assets & CSS:** Place custom CSS or JS in `static/` or override theme assets by mirroring the directory structure.
* **Theme parameters:** In `config.toml`, edit under:
    ```toml
    theme = "beautifulhugo"

    [params]
      Author = "Denis Shuvalov"
      Description = "Personal tech blog about Java, microservices, and more"
      ShowShareButtons = true
      # ... other params
    ```

## Building for Production

Generate the static files:

```bash
hugo
```
  
The generated site will be in the `public/` folder.

## Deployment
* **GitHub Pages:** Push `public/` to the `gh-pages` branch or configure the main branch for Pages.
* **Netlify/Vercel:** Connect your repo, set the build command to `hugo`, and the publish directory to `public/`.
  
