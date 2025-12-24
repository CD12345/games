// Game Registry - Plugin system for registering available games
//
// Settings types:
//   checkbox: { type: 'checkbox', default: true/false }
//   string:   { type: 'string', default: 'value' }
//   enum:     { type: 'enum', options: ['opt1', 'opt2'], default: 'opt1' }

const games = new Map();

export const GameRegistry = {
    // Register a new game
    // config.settings is optional array of setting definitions:
    // [{ id: 'settingId', label: 'Display Name', type: 'checkbox'|'string'|'enum', default: value, options?: [] }]
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
            getInitialState: config.getInitialState,
            debugOnly: config.debugOnly || false,
            settings: config.settings || []
        });
    },

    // Get a game by ID
    getGame(id) {
        return games.get(id) || null;
    },

    // Get list of all games for selection UI
    // Pass includeDebug=true to include debug-only games
    getGameList(includeDebug = false) {
        return Array.from(games.values())
            .filter(game => includeDebug || !game.debugOnly)
            .map(game => ({
                id: game.id,
                name: game.name,
                description: game.description,
                minPlayers: game.minPlayers,
                maxPlayers: game.maxPlayers,
                icon: game.icon,
                settings: game.settings
            }));
    },

    // Get default settings values for a game
    getDefaultSettings(id) {
        const game = games.get(id);
        if (!game || !game.settings) return {};

        const defaults = {};
        game.settings.forEach(setting => {
            defaults[setting.id] = setting.default;
        });
        return defaults;
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
