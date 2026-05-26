const http = require('http');
const PORT = 8574;
const VALID_GENRES = ["SCI_FI", "NOVEL", "HISTORY", "MANGA", "ROMANCE", "PROFESSIONAL"];

let books = []; // List of books in the system
let nextId = 1; // Auto-incrementing ID for new books

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
const sendJson = (res, statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' }); // Set status code and content type
    res.end(JSON.stringify(data)); // Send the JSON response
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
    try {
        // Parse URL and query strings
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`); // Parse the request URL
        let pathname = parsedUrl.pathname; // Extract the pathname
        if (pathname.length > 1 && pathname.endsWith('/')) { // Remove trailing slash for consistency
            pathname = pathname.slice(0, -1);
        }

        const method = req.method; // Extract the HTTP method
        const query = Object.fromEntries(parsedUrl.searchParams.entries()); // Convert query parameters to an object

        // Health - GET method
        if (pathname === '/books/health' && method === 'GET') {
            return sendJson(res, 200, { result: "OK" });
        }

        // Create new book - POST method
        if (pathname === '/book' && method === 'POST') {
            const body = await parseBody(req);
            const { title, author, year, price, genres } = body;

            // Book comparison
            if (books.some(b => b.title.toLowerCase() === title.toLowerCase())) {
                return sendJson(res, 409, { errorMessage: `Error: Book with the title [${title}] already exists in the system` });
            }

            // Year limits
            if (year < 1940 || year > 2100) {
                return sendJson(res, 409, { errorMessage: `Error: Can’t create new Book that its year [${year}] is not in the accepted range [1940 -> 2100]` });
            }

            // Negative Price
            if (price < 0) {
                return sendJson(res, 409, { errorMessage: `Error: Can’t create new Book with negative price` });
            }

            // Create new book
            const newBook = {
                id: nextId++,
                title,
                author,
                year,
                price,
                genres
            };
            
            // Add book to the system
            books.push(newBook);
            return sendJson(res, 200, { result: newBook.id });
        }

        // Get Total Books - GET method
        if (pathname === '/books/total' && method === 'GET') {
            const filterResult = getFilteredBooks(query);
            if (filterResult.error) {
                return sendJson(res, filterResult.error, { errorMessage: "Bad Request" });
            }
            return sendJson(res, 200, { result: filterResult.data.length });
        }

        // Get Books Data - GET method
        if (pathname === '/books' && method === 'GET') {
            const filterResult = getFilteredBooks(query);
            if (filterResult.error) {
                return sendJson(res, filterResult.error, { errorMessage: "Bad Request" });
            }

            // Sort by ascending title (case-insensitive)
            let sortedData = filterResult.data.sort((a, b) => 
                a.title.toLowerCase().localeCompare(b.title.toLowerCase())
            );
            return sendJson(res, 200, { result: sortedData });
        }

        // Get single-book data - GET method
        if (pathname === '/book' && method === 'GET') {
            const id = Number(query.id);
            const book = books.find(b => b.id === id);

            if (!book) {
                return sendJson(res, 404, { errorMessage: `Error: no such Book with id ${query.id}` });
            }
            return sendJson(res, 200, { result: book });
        }

        // Update Book's price - PUT method
        if (pathname === '/book' && method === 'PUT') {
            const id = Number(query.id);
            const newPrice = Number(query.price);
            const book = books.find(b => b.id === id);

            if (!book) {
                return sendJson(res, 404, { errorMessage: `Error: no such Book with id ${query.id}` });
            }

            if (newPrice <= 0) {
                return sendJson(res, 409, { errorMessage: `Error: price update for Book [${query.id}] must be a positive integer` });
            }

            const oldPrice = book.price;
            book.price = newPrice;
            return sendJson(res, 200, { result: oldPrice });
        }

        // Delete Book - DELETE method
        if (pathname === '/book' && method === 'DELETE') {
            const id = Number(query.id);
            const index = books.findIndex(b => b.id === id);

            if (index === -1) {
                return sendJson(res, 404, { errorMessage: `Error: no such book with id ${query.id}` });
            }

            books.splice(index, 1);
            return sendJson(res, 200, { result: books.length });
        }

        // Handle unknown paths
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessage: "Not Found" }));

    } catch (err) {
        // Global error handler
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessage: "Internal Server Error" }));
    }
});

// Start listening
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});