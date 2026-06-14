const http = require('http');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

const PORT = 8574;
const VALID_GENRES = ["SCI_FI", "NOVEL", "HISTORY", "MANGA", "ROMANCE", "PROFESSIONAL"];

let books = []; // List of books in the system
let nextId = 1; // Auto-incrementing ID for new books
let requestCounter = 0; // Counter for incoming requests

const logsDir = path.join(__dirname, 'logs');

// Create logs directory if it doesn't exist
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

const customTimestamp = winston.format((info) => { // Generate timestamp in the format "DD-MM-YYYY HH:mm:ss.SSS"
    const date = new Date();
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    const sss = String(date.getMilliseconds()).padStart(3, '0');
    info.timestamp = `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}.${sss}`;
    return info;
});

// Custom log structure 
const customFormat = winston.format.printf(({ level, message, timestamp, reqNum }) => {
    return `${timestamp} ${level.toUpperCase()}: ${message} | request #${reqNum}`;
});

// Initialize loggers for requests with appropriate transports and formats
const requestLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(customTimestamp(), customFormat),
    transports: [
        new winston.transports.File({ filename: path.join(logsDir, 'requests.log') }),
        new winston.transports.Console()
    ]
});

// Logger for book-related operations, logs only to file
const booksLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(customTimestamp(), customFormat),
    transports: [
        new winston.transports.File({ filename: path.join(logsDir, 'books.log') })
    ]
});

// Parse JSON body from incoming requests
const parseBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                resolve({});
            }
        });
        req.on('error', (err) => reject(err));
    });
};

// Send standard JSON responses
const sendJson = (res, statusCode, data, reqNum, targetLogger) => {
    if (data.errorMessage && statusCode >= 400 && statusCode !== 400) { // Log error messages for server errors (5xx) and client errors (4xx) except 400 which is logged in the request logger)
        if (targetLogger) 
            targetLogger.error(data.errorMessage, { reqNum });
    }

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
};

// Send plain text responses (used for health check)
const sendText = (res, statusCode, text) => {
    res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
    res.end(text);
};

// Filter books based on query parameters
function getFilteredBooks(query) {
    const {  // Extract query parameters
        author, 
        'price-bigger-than': priceBigger, 
        'price-less-than': priceLesser, 
        'year-bigger-than': yearBigger, 
        'year-less-than': yearLesser, 
        genres 
    } = query;

    // Validate numeric parameters
    const numericParams = [priceBigger, priceLesser, yearBigger, yearLesser];
    for (let p of numericParams) {
        if (p !== undefined && p !== "" && isNaN(Number(p))) {
            return { error: 400 };
        }
    }

    // Validate genres
    let filterGenres = [];
    if (genres) {
        filterGenres = genres.split(',');
        for (let g of filterGenres) {
            if (!VALID_GENRES.includes(g)) {
                return { error: 400 };
            }
        }
    }

    // Apply AND filters
    let filteredBooks = books.filter(b => { // Check each filter condition
        if (author && b.author.toLowerCase() !== author.toLowerCase()) return false;
        if (priceBigger !== undefined && priceBigger !== "" && b.price < Number(priceBigger)) return false;
        if (priceLesser !== undefined && priceLesser !== "" && b.price > Number(priceLesser)) return false;
        if (yearBigger !== undefined && yearBigger !== "" && b.year < Number(yearBigger)) return false;
        if (yearLesser !== undefined && yearLesser !== "" && b.year > Number(yearLesser)) return false;

        if (filterGenres.length > 0) { // Check if book genres match any of the filter genres
            const hasMatch = filterGenres.some(g => b.genres.includes(g));
            if (!hasMatch) return false;
        }
        
        return true;
    });

    return { data: filteredBooks };
}

// Server Init
const server = http.createServer(async (req, res) => { // Handle incoming requests
    requestCounter++; // Increment request counter for each incoming request
    const reqNum = requestCounter; // Assign a unique request number for logging
    const startTime = Date.now(); // Record start time to calculate request duration later
    
    try {
        // Parse URL and query strings
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`); // Parse the request URL
        let pathname = parsedUrl.pathname; // Extract the pathname
        if (pathname.length > 1 && pathname.endsWith('/')) { // Remove trailing slash for consistency
            pathname = pathname.slice(0, -1);
        }

        const method = req.method; // Extract the HTTP method
        const query = Object.fromEntries(parsedUrl.searchParams.entries()); // Convert query parameters to an object

        // Log incoming request details
        requestLogger.info(`Incoming request | #${reqNum} | resource: ${pathname} | HTTP Verb ${method}`, { reqNum });

        // Wrap res.end to log request duration before sending the response
        const originalEnd = res.end;
        res.end = function(chunk, encoding, callback) {
            const duration = Date.now() - startTime;
            requestLogger.debug(`request #${reqNum} duration: ${duration}ms`, { reqNum }); // Log request duration
            originalEnd.call(res, chunk, encoding, callback);
        };

        // Log Level - GET method
        if (pathname === '/logs/level' && method === 'GET') {
            const loggerName = query['logger-name'];
            if (loggerName === 'request-logger') {
                return sendText(res, 200, requestLogger.level.toUpperCase());
            } 
            else if (loggerName === 'books-logger') {
                return sendText(res, 200, booksLogger.level.toUpperCase());
            } 
            else {
                return sendText(res, 400, "Error: Logger not found");
            }
        }

        // Log Level - PUT method
        if (pathname === '/logs/level' && method === 'PUT') {
            const loggerName = query['logger-name']; 
            const newLevel = query['logger-level'];
            const validLevels = ['ERROR', 'INFO', 'DEBUG'];

            if (!validLevels.includes(newLevel)) {
                return sendText(res, 400, "Error: Invalid level provided");
            }

            if (loggerName === 'request-logger') {
                requestLogger.level = newLevel.toLowerCase();
                return sendText(res, 200, requestLogger.level.toUpperCase()); 
            } 
            else if (loggerName === 'books-logger') {
                booksLogger.level = newLevel.toLowerCase();
                return sendText(res, 200, booksLogger.level.toUpperCase());
            } 
            else {
                return sendText(res, 400, "Error: Logger not found");
            }
        }

        // Health - GET method
        if (pathname === '/books/health' && method === 'GET') {
            return sendJson(res, 200, { result: "OK" }, reqNum, requestLogger); // Log health check results
        }

        // Create new book - POST method
        if (pathname === '/book' && method === 'POST') {
            const body = await parseBody(req);
            const { title, author, year, price, genres } = body;

            if (books.some(b => b.title.toLowerCase() === title.toLowerCase())) {
                return sendJson(res, 409, { errorMessage: `Error: Book with the title [${title}] already exists in the system` }, reqNum, booksLogger);
            }
            if (year < 1940 || year > 2100) {
                return sendJson(res, 409, { errorMessage: `Error: Can’t create new Book that its year [${year}] is not in the accepted range [1940 -> 2100]` }, reqNum, booksLogger);
            }
            if (price < 0) {
                return sendJson(res, 409, { errorMessage: `Error: Can’t create new Book with negative price` }, reqNum, booksLogger);
            }

            booksLogger.info(`Creating new Book with Title [${title}]`, { reqNum });
            const existingBooksCount = books.length;

            const newBook = { id: nextId++, title, author, year, price, genres };
            books.push(newBook);

            booksLogger.debug(`Currently there are ${existingBooksCount} Books in the system. New Book will be assigned with id ${newBook.id}`, { reqNum });
            return sendJson(res, 200, { result: newBook.id }, reqNum, booksLogger);
        }

        // Get Total Books - GET method
        if (pathname === '/books/total' && method === 'GET') {
            const filterResult = getFilteredBooks(query);

            if (filterResult.error) 
                return sendJson(res, filterResult.error, { errorMessage: "Bad Request" }, reqNum, booksLogger);
            
            booksLogger.info(`Total Books found for requested filters is ${filterResult.data.length}`, { reqNum });
            return sendJson(res, 200, { result: filterResult.data.length }, reqNum, booksLogger);
        }

        // Get Books Data - GET method
        if (pathname === '/books' && method === 'GET') {
            const filterResult = getFilteredBooks(query);
            if (filterResult.error)
                 return sendJson(res, filterResult.error, { errorMessage: "Bad Request" }, reqNum, booksLogger);

            booksLogger.info(`Total Books found for requested filters is ${filterResult.data.length}`, { reqNum });
            let sortedData = filterResult.data.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
            return sendJson(res, 200, { result: sortedData }, reqNum, booksLogger);
        }

        // Get single-book data - GET method
        if (pathname === '/book' && method === 'GET') {
            const id = Number(query.id);
            const book = books.find(b => b.id === id);

            if (!book)
                 return sendJson(res, 404, { errorMessage: `Error: no such Book with id ${query.id}` }, reqNum, booksLogger);
            
            booksLogger.debug(`Fetching book id ${id} details`, { reqNum });
            return sendJson(res, 200, { result: book }, reqNum, booksLogger);
        }

        // Update Book's price - PUT method
        if (pathname === '/book' && method === 'PUT') {
            const id = Number(query.id);
            const newPrice = Number(query.price);
            const book = books.find(b => b.id === id);

            if (!book)
                 return sendJson(res, 404, { errorMessage: `Error: no such Book with id ${query.id}` }, reqNum, booksLogger);
            if (newPrice <= 0)
                 return sendJson(res, 409, { errorMessage: `Error: price update for Book [${query.id}] must be a positive integer` }, reqNum, booksLogger);

            const oldPrice = book.price;
            booksLogger.info(`Update Book id [${id}] price to ${newPrice}`, { reqNum });
            book.price = newPrice;
            booksLogger.debug(`Book [${book.title}] price change: ${oldPrice} --> ${newPrice}`, { reqNum });
            return sendJson(res, 200, { result: oldPrice }, reqNum, booksLogger);
        }

        // Delete Book - DELETE method
        if (pathname === '/book' && method === 'DELETE') {
            const id = Number(query.id);
            const index = books.findIndex(b => b.id === id);

            if (index === -1) 
                return sendJson(res, 404, { errorMessage: `Error: no such book with id ${query.id}` }, reqNum, booksLogger);

            const bookTitle = books[index].title;
            booksLogger.info(`Removing book [${bookTitle}]`, { reqNum });
            books.splice(index, 1);
            booksLogger.debug(`After removing book [${bookTitle}] id: [${id}] there are ${books.length} books in the system`, { reqNum });
            return sendJson(res, 200, { result: books.length }, reqNum, booksLogger);
        }

        // Handle unknown paths
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessage: "Not Found" }));

    } catch (err) {
        // Global error handler
        requestLogger.error("Internal Server Error", { reqNum }); 
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessage: "Internal Server Error" }));
    }
});

// Start listening
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});