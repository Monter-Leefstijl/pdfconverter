# Monter PDF Converter

[![Docker pulls](https://img.shields.io/docker/pulls/monterleefstijl/pdfconverter?style=flat&logo=docker&logoColor=white)](https://hub.docker.com/r/monterleefstijl/pdfconverter)

Monter PDF Converter is a simple, developer-friendly API for converting a very large number of document formats into
high-quality PDF files. It is designed to handle multiple *concurrent* jobs, and ensures high-availability with health
checks and automatic restarts.

It is used in production by [Monter Leefstijl](https://www.monterleefstijl.nl/).

## Chromium, LibreOffice, and Pandoc

Monter PDF Converter uses **Chromium**, **LibreOffice** and **Pandoc** to convert to PDFs to faithfully reproduce the
formatting and layout of the original documents.

- **Chromium**: For converting HTML files, Chromium is well-suited because it accurately renders HTML, CSS, and 
  JavaScript, and supports modern web standards, ensuring that styles, fonts and other elements are preserved.
- **LibreOffice**: For conversion from Word, Excel, PowerPoint and other document formats, LibreOffice is well-suited
  because of its ability to produce clean, high-quality PDFs with proper formatting and layout.
- **Pandoc**: For other documents, Pandoc is used.

The application automatically selects the correct converter based on the inferred MIME-type, the extension and the
given type.

## Key features

- **High-quality PDFs**: Uses Chromium (for HTML), LibreOffice (for documents) and Pandoc (for other files) to produce high-quality PDFs.
- **Multi-format support**: Converts HTML, DOCX, PPTX, XLSX, and many other formats to PDF.
- **Fast and concurrent**: Handles multiple conversion jobs concurrently and queues additional jobs.
- **Health checks**: Provides a health check endpoint to monitor the service status.
- **High-availability**: Ensures high-availability by automatically restarting child services (i.e. Chromium and LibreOffice) in case of failure.
- **Highly configurable**: Allows customization of various settings through environment variables.
- **Developer-friendly API**: Provides a single endpoint for conversion, and automatically selects the correct converter.
- **Uncomplicated**: The entire source code is a single TypeScript file of ~1500 LOC.

## Endpoints

The following endpoints are available:

- `POST /`: Convert a document to PDF.
- `GET /healthcheck`: Check the health of the service.

### `POST /`: Convert a document to PDF

```shell
curl --location 'http://localhost:8080' \
  --form 'input=@"index.html"' \
  --form 'resources=@"dog.jpg"' \
  --form 'resources=@"cat.jpg"'
```

#### Request

The endpoint accept a `multipart/form-data` request with the following fields:

- `input` (*required*): The document to convert.
- `resources` (*optional*): Additional resources for conversion.
- `type` (*optional*): The type of the **given** document.

The `resources` field can contain additional resources for conversion from `.html` and `.xhtml` that cannot be embedded in
the file itself. For example, if the file contains an image tag referencing `dog.jpg`, it may be included as a resource
to have it be displayed in the PDF. The `type` field can be used to specify the type of the **input** document whenever
this is ambiguous, such as for `.txt` files.

##### Supported input types

| File type                                                                                                          | Common extensions                                                                    | Converter         |
|--------------------------------------------------------------------------------------------------------------------| ------------------------------------------------------------------------------------ | ----------------- |
| `biblatex` ([BibLaTeX](https://ctan.org/pkg/biblatex))                                                             | `.biblatex`                                                                          | Pandoc            |
| `bibtex` ([BibTeX](http://www.bibtex.org/))                                                                        | `.bib`, `.bibtex`                                                                    | Pandoc            |
| `bits` ([BITS XML](https://jats.nlm.nih.gov/extensions/bits/))                                                     | `.xml`                                                                               | Pandoc            |
| `commonmark_x` ([CommonMark](https://commonmark.org/) with extensions)                                             | `.txt`                                                                               | Pandoc            |
| `commonmark` ([CommonMark](https://commonmark.org/))                                                               | `.commonmark`                                                                        | Pandoc            |
| `creole` ([Creole 1.0](https://www.wikicreole.org/wiki/Creole1.0))                                                 | `.creole`                                                                            | Pandoc            |
| `csljson` ([CSL JSON](https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html))                          | `.csljson`, `.json`                                                                  | Pandoc            |
| `csv` ([CSV](https://en.wikipedia.org/wiki/Comma-separated_values))                                                | `.csv`                                                                               | Pandoc            |
| `djot` ([Djot](https://djot.net/))                                                                                 | `.dj`                                                                                | Pandoc            |
| `docbook` ([DocBook](https://docbook.org/))                                                                        | `.xml`                                                                               | Pandoc            |
| `docx` ([Microsoft Word](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-docx))                    | `.docx`                                                                              | LibreOffice       |
| `dokuwiki` ([DokuWiki markup](https://www.dokuwiki.org/wiki:syntax))                                               | `.dokuwiki`                                                                          | Pandoc            |
| `endnotexml` ([EndNote XML](https://endnote.com/))                                                                 | `.xml`                                                                               | Pandoc            |
| `epub` ([EPUB](https://www.w3.org/publishing/epub3/))                                                              | `.epub`                                                                              | Pandoc            |
| `fb2` ([FictionBook2](https://en.wikipedia.org/wiki/FictionBook))                                                  | `.fb2`                                                                               | Pandoc            |
| `haddock` ([Haddock markup](https://www.haskell.org/haddock/))                                                     | `.hs`                                                                                | Pandoc            |
| `html` ([HTML](https://www.w3.org/html/))                                                                          | `.html`, `.htm`                                                                      | Chromium          |
| `ipynb` ([Jupyter Notebook](https://jupyter.org/))                                                                 | `.ipynb`                                                                             | Pandoc            |
| `jats` ([JATS XML](https://jats.nlm.nih.gov/))                                                                     | `.xml`                                                                               | Pandoc            |
| `json` (JSON version of native AST)                                                                                | `.json`                                                                              | Pandoc            |
| `latex` ([LaTeX](https://www.latex-project.org/))                                                                  | `.tex`                                                                               | Pandoc            |
| `man` ([roff man](https://en.wikipedia.org/wiki/Man_page))                                                         | `.man`                                                                               | Pandoc            |
| `markdown_mmd` ([MultiMarkdown](https://fletcherpenney.net/multimarkdown/))                                        | `.mmd`                                                                               | Pandoc            |
| `markdown_strict` ([Original Markdown](https://daringfireball.net/projects/markdown/))                             | `.txt`                                                                               | Pandoc            |
| `markdown` ([Pandoc’s Markdown](https://pandoc.org/MANUAL.html#pandocs-markdown))                                  | `.md`, `.markdown`, `.mkd`, `.mdown`, `.mkdn`, `.mdwn`, `.mdtxt`, `.mdtext`, `.text` | Pandoc            |
| `mdoc` ([mdoc](https://man.openbsd.org/mdoc))                                                                      | `.mdoc`                                                                              | Pandoc            |
| `mediawiki` ([MediaWiki markup](https://www.mediawiki.org/wiki/Help:Formatting))                                   | `.wiki`                                                                              | Pandoc            |
| `muse` ([Emacs Muse](https://www.emacswiki.org/emacs/EmacsMuse))                                                   | `.muse`                                                                              | Pandoc            |
| `odt` ([OpenDocument Text](https://en.wikipedia.org/wiki/OpenDocument))                                            | `.odt`                                                                               | LibreOffice       |
| `opendocument` ([OpenDocument](https://www.oasis-open.org/2021/06/16/opendocument-v1-3-oasis-standard-published/)) | `.od*`                                                                               | LibreOffice       |
| `opml` ([OPML](http://opml.org/))                                                                                  | `.opml`                                                                              | Pandoc            |
| `org` ([Emacs Org mode](https://orgmode.org/))                                                                     | `.org`                                                                               | Pandoc            |
| `pod` ([Perl POD](https://perldoc.perl.org/perlpod))                                                               | `.pod`                                                                               | Pandoc            |
| `pptx` ([Microsoft PowerPoint](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-pptx))              | `.pptx`                                                                              | LibreOffice       |
| `ris` ([RIS](https://en.wikipedia.org/wiki/RIS_%28file_format%29))                                                 | `.ris`                                                                               | Pandoc            |
| `rst` ([reStructuredText](https://docutils.sourceforge.io/rst.html))                                               | `.rst`                                                                               | Pandoc            |
| `rtf` ([Rich Text Format](https://www.loc.gov/preservation/digital/formats/fdd/fdd000270.shtml))                   | `.rtf`                                                                               | LibreOffice       |
| `t2t` ([txt2tags](https://txt2tags.org/))                                                                          | `.t2t`                                                                               | Pandoc            |
| `textile` ([Textile](https://textile-lang.com/doc/))                                                               | `.textile`                                                                           | Pandoc            |
| `tikiwiki` ([TikiWiki markup](https://doc.tiki.org/Wiki-Syntax))                                                   | `.tiki`                                                                              | Pandoc            |
| `tsv` ([TSV](https://en.wikipedia.org/wiki/Tab-separated_values))                                                  | `.tsv`                                                                               | Pandoc            |
| `twiki` ([TWiki markup](https://twiki.org/cgi-bin/view/TWiki/TextFormattingRules))                                 | `.twiki`                                                                             | Pandoc            |
| `typst` ([Typst](https://typst.app/))                                                                              | `.typ`                                                                               | Pandoc            |
| `vimwiki` ([Vimwiki markup](https://vimwiki.github.io/))                                                           | `.vimwiki`                                                                           | Pandoc            |
| `xlsx` ([Microsoft Excel](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx))                   | `.xlsx`                                                                              | LibreOffice       |

#### Response

- `200 OK`: The document is successfully converted to a PDF. The response will contain the PDF file with content-type
  `application/pdf`.
- `400 Bad Request`: The request is invalid (e.g. missing required `input` field).
- `413 Payload Too Large`: The document is too large to be processed.
- `415 Unsupported Media Type`: The document type is not supported, or is not correctly specified.
- `502 Bad Gateway`: The conversion failed in Chromium, LibreOffice or Pandoc.
- `503 Service Unavailable`: The request is denied because the job queue is full.
- `504 Gateway Timeout`: The conversion took too long to complete.

### `GET /healthcheck`: Check the health of the service

```shell
curl --location 'http://localhost:8080/healthcheck'
```

#### Request

The endpoint accepts a `GET` request with no parameters.

#### Response

- `200 OK`: The service is healthy.
- `503 Service Unavailable`: The service is unhealthy.

```json
{
    "health": {
        "browser": "healthy",
        "pandoc": "healthy",
        "unoservers": {
            "2003": "healthy",
            "2004": "healthy",
            "2005": "healthy",
            "2006": "healthy",
            "2007": "healthy",
            "2008": "healthy",
            "2009": "healthy",
            "2010": "healthy",
            "2011": "healthy",
            "2012": "healthy",
            "2013": "healthy",
            "2014": "healthy"
        },
        "webserver": "healthy",
        "jobQueue": "healthy"
    }
}
```

## Settings

Below is a table of environment variables that can be used to configure the service.

| Name                          | Description                                                                                         | Default value               |
|-------------------------------|-----------------------------------------------------------------------------------------------------|-----------------------------|
| `WEBSERVER_PORT`              | The port the web server listens on.                                                                 | `8080`                      |
| `CHROME_EXECUTABLE_PATH`      | The path to the Chrome executable.                                                                  | `/usr/bin/chromium-browser` |
| `LIBREOFFICE_EXECUTABLE_PATH` | The path to the LibreOffice executable.                                                             | `/usr/bin/libreoffice`      |
| `UNOSERVER_EXECUTABLE_PATH`   | The path to the Unoserver executable.                                                               | `/usr/bin/unoserver`        |
| `UNOCONVERT_EXECUTABLE_PATH`  | The path to the Unoconvert executable.                                                              | `/usr/bin/unoconvert`       |
| `UNOSERVER_LAUNCH_TIMEOUT`    | The maximum time to wait in milliseconds for unoserver to launch.                                   | `30000` (30 seconds)        |
| `PANDOC_EXECUTABLE_PATH`      | The path to the Pandoc executable.                                                                  | `/usr/bin/pandoc`           |
| `CHROME_LAUNCH_TIMEOUT`       | The maximum time to wait in milliseconds for Chrome to launch.                                      | `30000` (30 seconds)        |
| `CHROME_RESTART_INTERVAL`     | The interval in milliseconds to restart the browser.                                                | `86400000` (1 day)          |
| `PDF_RENDER_TIMEOUT`          | The maximum time to spend rendering a single PDF.                                                   | `150000` (2.5 minutes)      |
| `MAX_FILE_SIZE`               | The maximum size in bytes for each uploaded file.                                                   | `134217728` (128 MB)        |
| `MAX_CONCURRENT_JOBS`         | The maximum number of concurrent jobs. Settings this to a high value may cause unexpected behaviour. | `6`                         | 
| `MAX_QUEUED_JOBS`             | The maximum number of jobs in the queue.                                                            | `128`                       |
| `MAX_RESOURCE_COUNT`          | The maximum number of resources (e.g. images) that can be uploaded.                                 | `16`                        |
| `MAX_RESTARTS`                | The maximum number of times processes can be restarted within 60 seconds before giving up.          | `3`                         |
| `RESTART_DELAY`               | The interval in milliseconds to wait before restarting subprocesses.                                | `5000` (5 seconds)          |

## Installation

> [!IMPORTANT]
> It is not recommended to expose Monter PDF Converter to the world directly, unless you take proper precautions (such as sandboxing or using a separate server).

1.  Follow [this guide](https://docs.docker.com/engine/install/) to install Docker on your machine.
2.  Follow [this guide](https://docs.docker.com/compose/install/) to install Docker Compose on your machine.
3.  Copy the `docker-compose.sample.yaml` in this repository and rename it to `docker-compose.yaml`.
4.  Configure the port mapping as necessary in the `docker-compose.yaml` file.
5.  Start the service by running the following command:
    ```bash
    docker compose up -d
    ```
6. Done! Navigate to http://localhost:1337/healthcheck to check if everything works. It may take some time for
   everything to become healthy.

## Contributing

Contributions are welcome! Please [submit a pull request](https://github.com/Monter-Leefstijl/pdfconverter/pulls) or
[open an issue](https://github.com/Monter-Leefstijl/pdfconverter/issues) to discuss any changes.

## License

This project is licensed under the MIT License. See the [LICENSE](https://github.com/Monter-Leefstijl/pdfconverter/blob/main/LICENSE) file for details.

## Contact

For any questions or support, please [open an issue on GitHub](https://github.com/Monter-Leefstijl/pdfconverter/issues).

## Alternatives

For comparison, consider exploring these alternatives:

- [Gotenberg](https://github.com/gotenberg/gotenberg): More comphrensive API, but with less supported file types and no native support for concurrent jobs.
- [wkhtmltopdf](https://github.com/wkhtmltopdf/wkhtmltopdf): Command-line tool to convert HTML to PDF using WebKit.
- [puppeteer-html-to-pdf-converter](https://github.com/fritsvt/puppeteer-html-to-pdf-converter): Simple API for converting from HTML to PDF.
