// Game Registry - Plugin system for registering available games

const games = new Map();

export const GameRegistry = {
    // Register a new game
    register(id, config) {
        if (games.has(id)) {
            console.warn(`Game '${id}' is already registered, overwriting.`);
        }
        games.set(id, {
            id,
            name: config.name,
            description: config.description,
            minPlayers: config.minPlayers || 2,
            maxPlayers: config.maxPlayers || 2,
            icon: config.icon || '🎮',
            gameClass: config.gameClass,
            getInitialState: config.getInitialState
        });
    },

    // Get a game by ID
    getGame(id) {
        return games.get(id) || null;
    },

    // Get list of all games for selection UI
    getGameList() {
        return Array.from(games.values()).map(game => ({
            id: game.id,
            name: game.name,
            description: game.description,
            minPlayers: game.minPlayers,
            maxPlayers: game.maxPlayers,
            icon: game.icon
        }));
    },

    // Get game class for instantiation
    getGameClass(id) {
        const game = games.get(id);
        return game?.gameClass || null;
    },

    // Check if a game is registered
    hasGame(id) {
        return games.has(id);
    }
};
