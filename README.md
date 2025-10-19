# Electron Application

This is a basic Electron application scaffold.

## Getting Started

To get started with this application, follow these steps:

1.  **Install Dependencies**

    Make sure you have Node.js and npm installed. Then, install the project dependencies:

    ```bash
    npm install
    ```

2.  **Run the Application**

    To start the Electron application, run the following command:

    ```bash
    npm start
    ```

## Development

-   The main process entry point is `main.js`.
-   The renderer process (UI) is defined in `index.html`, `renderer.js`, and `index.css`.
-   You can open the developer tools in the Electron window by uncommenting `mainWindow.webContents.openDevTools();` in `main.js`.

## Project Structure

-   `src/main.js`: The main process script that creates the browser window and handles system events.
-   `src/index.html`: The user interface for the application.
-   `src/index.css`: Styles for the user interface.
-   `src/preload.js`: A script that runs before the renderer process loads, providing a bridge between the main and renderer processes.
-   `src/renderer.js`: The renderer process script for handling UI logic.
-   `package.json`: Project metadata and dependencies.
