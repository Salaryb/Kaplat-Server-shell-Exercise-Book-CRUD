# Book Catalog Server

A REST-style HTTP server for managing a book catalog, written in **vanilla Node.js** with only the built-in `http` module — no Express or other web framework. It supports full CRUD operations, query-string filtering, and structured logging with **Winston**, including changing log levels at runtime through the API.

## Features

- **CRUD operations** for books: create, read, update price, and delete
- **Filtering** by author, price range, year range and genres, combined with AND logic
- **Hand-written routing** on top of the native `http` module, with URL and query-string parsing and trailing-slash normalization
- **Input validation** with meaningful status codes (`400`, `404`, `409`, `500`)
- **Two Winston loggers** (requests and books) with a custom timestamp format, writing to log files and the console
- **Runtime log-level control**: read or change each logger's level through an endpoint, without restarting
- **Request tracing**: every request gets a sequential number, and its duration is logged at `DEBUG` level
- **Docker** support

## Tech Stack

| Area | Technology |
| --- | --- |
| Runtime | Node.js 20 |
| HTTP server | Built-in `http` module |
| Logging | Winston 3 |
| Containerization | Docker (`node:20.16-alpine`) |

## Getting Started

### Run locally

Requires [Node.js](https://nodejs.org/) and npm.

```bash
git clone https://github.com/Salaryb/Kaplat-Server-shell-Exercise-Book-CRUD.git
cd Kaplat-Server-shell-Exercise-Book-CRUD
npm install
npm start
```

On Windows you can also run `run.bat`.

### Run with Docker

```bash
docker build -t book-server .
docker run -p 8574:8574 book-server
```

The server listens on **`http://localhost:8574`**.

> Data is stored in memory, so the catalog resets every time the server restarts.

## Data Model

```json
{
  "id": 1,
  "title": "Dune",
  "author": "Frank Herbert",
  "year": 1965,
  "price": 45,
  "genres": ["SCI_FI", "NOVEL"]
}
```

Valid genres: `SCI_FI`, `NOVEL`, `HISTORY`, `MANGA`, `ROMANCE`, `PROFESSIONAL`.

## API Reference

All book endpoints return JSON. A successful response has the shape `{ "result": ... }`, and an error has the shape `{ "errorMessage": "..." }`.

### Endpoints

| Method | Endpoint | Description | Returns |
| --- | --- | --- | --- |
| `GET` | `/books/health` | Health check | `"OK"` |
| `POST` | `/book` | Create a book (JSON body) | The new book's ID |
| `GET` | `/book?id=<id>` | Get one book | The book |
| `GET` | `/books` | Get all books matching the filters, sorted by title | Array of books |
| `GET` | `/books/total` | Count the books matching the filters | Number of books |
| `PUT` | `/book?id=<id>&price=<price>` | Update a book's price | The old price |
| `DELETE` | `/book?id=<id>` | Delete a book | Number of books left |
| `GET` | `/logs/level?logger-name=<name>` | Get a logger's current level | Plain-text level |
| `PUT` | `/logs/level?logger-name=<name>&logger-level=<level>` | Change a logger's level | Plain-text new level |

### Validation rules

| Endpoint | Rule | Status |
| --- | --- | --- |
| `POST /book` | Title must be unique (case-insensitive) | `409` |
| `POST /book` | Year must be between 1940 and 2100 | `409` |
| `POST /book` | Price can't be negative | `409` |
| `PUT /book` | New price must be positive | `409` |
| `GET`/`PUT`/`DELETE /book` | Book with the given ID must exist | `404` |
| `GET /books`, `/books/total` | Numeric filters must be numbers, genres must be valid | `400` |
| `/logs/level` | Logger name and level must be valid | `400` |
| Any other route | — | `404` |

### Filters

`GET /books` and `GET /books/total` accept these optional query parameters. All filters are combined with AND.

| Parameter | Matches books where |
| --- | --- |
| `author` | The author equals the value (case-insensitive) |
| `price-bigger-than` | Price ≥ value |
| `price-less-than` | Price ≤ value |
| `year-bigger-than` | Year ≥ value |
| `year-less-than` | Year ≤ value |
| `genres` | The book has at least one of the listed genres (comma-separated) |

### Examples

Create a book:

```bash
curl -X POST http://localhost:8574/book \
  -H "Content-Type: application/json" \
  -d '{"title": "Dune", "author": "Frank Herbert", "year": 1965, "price": 45, "genres": ["SCI_FI", "NOVEL"]}'
# {"result":1}
```

Find sci-fi or manga books under 50:

```bash
curl "http://localhost:8574/books?genres=SCI_FI,MANGA&price-less-than=50"
```

Update a price:

```bash
curl -X PUT "http://localhost:8574/book?id=1&price=60"
# {"result":45}
```

Delete a book:

```bash
curl -X DELETE "http://localhost:8574/book?id=1"
# {"result":0}
```

## Logging

The server uses two Winston loggers. Both start at `INFO` level and write to a `logs/` folder, which is created automatically.

| Logger name | Output | What it records |
| --- | --- | --- |
| `request-logger` | `logs/requests.log` and the console | Every incoming request (resource and HTTP verb), its duration at `DEBUG` level, and unexpected server errors |
| `books-logger` | `logs/books.log` | Book operations (create, update, delete, search results), with extra detail at `DEBUG` level and failed operations at `ERROR` level |

Each line uses a custom format with millisecond timestamps and the request number, so one request can be traced across both files:

```
21-10-2026 08:53:12.345 INFO: Incoming request | #3 | resource: /book | HTTP Verb POST | request #3
21-10-2026 08:53:12.347 INFO: Creating new Book with Title [Dune] | request #3
```

Change a logger's level at runtime (`ERROR`, `INFO` or `DEBUG`):

```bash
curl -X PUT "http://localhost:8574/logs/level?logger-name=books-logger&logger-level=DEBUG"
# DEBUG
```

## Project Structure

```
├── server.js       # HTTP server, routing, validation, filtering and logging
├── package.json    # Project metadata and the start script
├── Dockerfile      # Container image definition
└── run.bat         # Windows shortcut to start the server
```

## Author

**Ben Jaitin** — Computer Science student, The Academic College of Tel Aviv-Yafo
