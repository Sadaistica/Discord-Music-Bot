const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { google } = require('googleapis');
const YouTube = require('youtube-sr').default;
const { spawn } = require('child_process');
// Commands are not used; REST and Routes imports removed

// Databáze pro leaderboard
let database = {};
try {
    database = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
} catch (error) {
    database = { leaderboard: {}, settings: { disconnectTimeout: 1800000 } };
    fs.writeFileSync('./database.json', JSON.stringify(database, null, 2));
}

// Funkce pro uložení databáze
function saveDatabase() {
    fs.writeFileSync('./database.json', JSON.stringify(database, null, 2));
}

// Funkce pro přidání bodu do leaderboardu
function addLeaderboardPoint(userId, username) {
    if (!database.leaderboard[userId]) {
        database.leaderboard[userId] = {
            username: username,
            count: 0
        };
    }
    database.leaderboard[userId].count++;
    database.leaderboard[userId].username = username; // Aktualizace jména
    saveDatabase();
    updateLeaderboardEmbeds();
}

// Funkce pro přidání statistiky písničky
function addSongStat(songTitle, songUrl) {
    // Zajistit, že songStats existuje
    if (!database.songStats) {
        database.songStats = {};
    }
    
    const songKey = songUrl || songTitle;
    if (!database.songStats[songKey]) {
        database.songStats[songKey] = {
            title: songTitle,
            url: songUrl,
            playCount: 0
        };
    }
    database.songStats[songKey].playCount++;
    database.songStats[songKey].title = songTitle; // Aktualizace názvu
    saveDatabase();
    updateLeaderboardEmbeds();
}

// Funkce pro získání top 20 leaderboardu
function getLeaderboard() {
    const sorted = Object.entries(database.leaderboard)
        .filter(([userId, data]) => data.username !== 'AutoTest') // Vyfiltrovat AutoTest
        .sort(([,a], [,b]) => b.count - a.count)
        .slice(0, 20);
    return sorted;
}

// Funkce pro získání top 20 nejpřehrávanějších písniček
function getTopSongs() {
    // Zajistit, že songStats existuje
    if (!database.songStats) {
        database.songStats = {};
    }
    
    const sorted = Object.entries(database.songStats)
        .sort(([,a], [,b]) => b.playCount - a.playCount)
        .slice(0, 20);
    return sorted;
}

// Globální proměnné pro leaderboard zprávy
let leaderboardChannelId = null;
let userLeaderboardMessageId = null;
let songLeaderboardMessageId = null;

// Funkce pro aktualizaci leaderboard embedů
async function updateLeaderboardEmbeds() {
    if (!leaderboardChannelId || !client.channels.cache.has(leaderboardChannelId)) return;
    
    const channel = client.channels.cache.get(leaderboardChannelId);
    if (!channel) return;
    
    try {
        // Aktualizace uživatelského leaderboardu
        if (userLeaderboardMessageId) {
            const userMessage = await channel.messages.fetch(userLeaderboardMessageId).catch(() => null);
            if (userMessage) {
                const userEmbed = createUserLeaderboardEmbed();
                await userMessage.edit({ embeds: [userEmbed] });
            }
        }
        
        // Aktualizace písničkového leaderboardu
        if (songLeaderboardMessageId) {
            const songMessage = await channel.messages.fetch(songLeaderboardMessageId).catch(() => null);
            if (songMessage) {
                const songEmbed = createSongLeaderboardEmbed();
                await songMessage.edit({ embeds: [songEmbed] });
            }
        }
    } catch (error) {
        console.error('Error updating leaderboard embeds:', error);
    }
}

// Funkce pro vytvoření uživatelského leaderboard embedu
function createUserLeaderboardEmbed() {
    const leaderboard = getLeaderboard();
    
    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏆 Top 20 Users – Added Songs')
        .setTimestamp();
    
    if (leaderboard.length === 0) {
        embed.setDescription('No songs have been added yet.');
    } else {
        const leaderboardText = leaderboard.map(([userId, data], index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            return `${medal} **${data.username}** - ${data.count} songs`;
        }).join('\n');
        
        embed.setDescription(leaderboardText);
    }
    
    return embed;
}

// Funkce pro vytvoření písničkového leaderboard embedu
function createSongLeaderboardEmbed() {
    const topSongs = getTopSongs();
    
    const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('🎵 Top 20 Most Played Songs')
        .setTimestamp();
    
    if (topSongs.length === 0) {
        embed.setDescription('No songs have been played yet.');
    } else {
        const songsText = topSongs.map(([songKey, data], index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const title = data.title.length > 50 ? data.title.substring(0, 50) + '...' : data.title;
            return `${medal} **${title}** - ${data.playCount}x`;
        }).join('\n');
        
        embed.setDescription(songsText);
    }
    
    return embed;
}

// Konfigurace
let config;

try {
    config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch (error) {
    console.error('❌ Error loading config.json:', error.message);
    console.log('💡 Make sure config.json exists and contains valid JSON.');
    process.exit(1);
}

// Validace konfigurace (config.json only)
if (!config.youtube) { config.youtube = {}; }

if (!config.token || config.token === 'YOUR_BOT_TOKEN') {
    console.error('❌ Bot token is not set in config.json!');
    process.exit(1);
}

if (!config.clientId || config.clientId === 'YOUR_CLIENT_ID') {
    console.error('❌ Client ID is not set in config.json!');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

// Globální proměnné pro hudbu
const musicData = new Map();

// YouTube API klient
const youtube = google.youtube({
    version: 'v3',
    auth: config.youtube.apiKey // Použijeme API klíč pro autentifikaci
});

class MusicPlayer {
    constructor(guildId) {
        this.guildId = guildId;
        this.queue = [];
        this.currentSong = null;
        this.player = createAudioPlayer();
        this.connection = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.controlMessage = null;
        this.loopMode = 'off'; // 'off', 'playlist', 'song'
        this.inactivityTimeout = null;
        
        this.setupPlayerEvents();
        this.startInactivityTimer();
    }
    
    setupPlayerEvents() {
        this.player.on(AudioPlayerStatus.Playing, () => {
            this.isPlaying = true;
            this.isPaused = false;
            this.resetInactivityTimer();
            this.updateControlEmbed();
        });
        
        this.player.on(AudioPlayerStatus.Paused, () => {
            this.isPaused = true;
            this.updateControlEmbed();
        });
        
        this.player.on(AudioPlayerStatus.Idle, () => {
            this.isPlaying = false;
            this.isPaused = false;
            
            if (this.loopMode === 'song' && this.currentSong) {
                // Přehrát stejnou písničku znovu
                this.playSong(this.currentSong);
            } else {
                this.playNext();
            }
            
            // Pokud není žádná další písnička, spustit timer pro odpojení
            if (!this.currentSong && this.queue.length === 0) {
                this.startInactivityTimer();
            }
        });
        
        this.player.on('error', error => {
            console.error('Player error:', error);
            this.playNext();
        });
    }
    
    async addSong(input, user) {
        try {
            let songs = [];
            
            // Kontrola, zda je to playlist (nie jednotlivé video s playlist parametrom)
             if ((input.includes('playlist?list=') || (input.includes('&list=') && !input.includes('watch?v='))) && !input.includes('watch?v=')) {
                console.log('🎵 Detected playlist, loading songs...');
                const playlistSongs = await this.getPlaylistSongs(input);
                for (const songData of playlistSongs) {
                    const song = {
                        title: songData.title || 'Unknown title',
                        url: songData.url,
                        duration: songData.duration || 'Unknown length',
                        thumbnail: songData.thumbnail || null,
                        requestedBy: user
                    };
                    this.queue.push(song);
                    songs.push(song);
                }
                
                // Přidání pouze jednoho bodu do leaderboardu za celý playlist
                if (songs.length > 0) {
                    addLeaderboardPoint(user.id, user.username || user.displayName || 'Unknown user');
                }
                
                if (!this.isPlaying && songs.length > 0) {
                    this.playNext();
                }
                
                this.updateControlEmbed();
                return { isPlaylist: true, count: songs.length, songs: songs };
            }
            
            let songInfo;
            
            // Extrakce video ID z YouTube URL
            const videoId = this.extractVideoId(input);
            
            if (videoId) {
                // Použití YouTube Data API pro získání informací o videu
                const response = await youtube.videos.list({
                    part: ['snippet', 'contentDetails'],
                    id: [videoId]
                });
                
                if (response.data.items.length === 0) {
                    throw new Error('Video not found');
                }
                
                const video = response.data.items[0];
                songInfo = {
                    title: video.snippet.title,
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    duration: this.formatDuration(video.contentDetails.duration),
                    thumbnail: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url,
                    requestedBy: user
                };
            } else {
                // Pokud není URL, hledáme podle názvu
                const searchResults = await YouTube.search(input, { limit: 1 });
                if (searchResults.length === 0) {
                    throw new Error('No results found');
                }
                
                const video = searchResults[0];
                songInfo = {
                    title: video.title,
                    url: video.url,
                    duration: video.durationFormatted,
                    thumbnail: video.thumbnail?.url,
                    requestedBy: user
                };
            }
            
            this.queue.push(songInfo);
            
            // Přidání bodu do leaderboardu
            addLeaderboardPoint(user.id, user.username || user.displayName || 'Unknown user');
            // Přidání statistiky písničky
            addSongStat(songInfo.title, songInfo.url);
            
            // Reset inactivity timer při přidání písničky
            this.resetInactivityTimer();
            
            // Přidejte tento řádek pro aktualizaci embed zprávy:
            this.updateControlEmbed();
            
            if (!this.isPlaying && !this.isPaused) {
                this.playNext();
            }
            
            return songInfo;
        } catch (error) {
            throw new Error(`Error adding song: ${error.message}`);
        }
    }
    
    async getPlaylistSongs(playlistUrl) {
        try {
            const ytDlpProcess = spawn('python', ['-m', 'yt_dlp', 
                '--flat-playlist',
                '--print', '%(title)s|||%(url)s|||%(duration)s|||%(thumbnail)s',
                '--playlist-end', '50', // Limit na 50 písniček
                playlistUrl
            ], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let output = '';
            let errorOutput = '';
            
            ytDlpProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            ytDlpProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            await new Promise((resolve, reject) => {
                ytDlpProcess.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`yt-dlp failed with code ${code}: ${errorOutput}`));
                    }
                });
            });
            
            const songs = [];
            const lines = output.trim().split('\n');
            
            for (const line of lines) {
                if (line.includes('|||')) {
                    const [title, url, duration, thumbnail] = line.split('|||');
                    songs.push({
                        title: title || 'Unknown title',
                        url: url || '',
                        duration: duration || 'Unknown length',
                        thumbnail: thumbnail || null
                    });
                }
            }
            
            return songs;
        } catch (error) {
            console.error('Error loading playlist:', error);
            return [];
        }
    }
    
    async playNext() {
        if (this.queue.length > 0) {
            const nextSong = this.queue.shift();
            await this.playSong(nextSong);
        } else if (this.loopMode === 'playlist' && this.currentSong) {
            // Přidat aktuální písničku zpět na konec fronty pro loop
            this.queue.push(this.currentSong);
            const nextSong = this.queue.shift();
            await this.playSong(nextSong);
        } else {
            this.currentSong = null;
            this.isPlaying = false;
            this.updateControlEmbed();
        }
    }
    
    async playSong(song, retryCount = 0) {
        this.currentSong = song;
        
        try {
            // Konvertujeme YouTube Music URL na štandardnú YouTube URL ak je potrebné
            let playUrl = this.currentSong.url;
            if (this.currentSong.url.includes('music.youtube.com')) {
                const videoId = this.extractVideoId(this.currentSong.url);
                if (videoId) {
                    playUrl = `https://www.youtube.com/watch?v=${videoId}`;
                }
            }
            
            console.log(`🔍 Attempting to play: ${this.currentSong.title}`);
            console.log(`🔗 Original URL: ${this.currentSong.url}`);
            console.log(`🔗 Converted URL: ${playUrl}`);
            
            // Use yt-dlp for better reliability and YouTube compatibility
            // Prefer Android client to avoid SABR streaming and ensure direct audio formats
            const ytDlpProcess = spawn('python', ['-m', 'yt_dlp', 
                '--get-url', 
                '--format', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
                '--extractor-args', 'youtube:player_client=android',
                '--user-agent', 'com.google.android.youtube/18.50.36 (Linux; U; Android 13)',
                '--no-check-certificate',
                '--force-ipv4',
                '--no-playlist',
                playUrl
            ], {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let audioUrl = '';
            let errorOutput = '';
            
            ytDlpProcess.stdout.on('data', (data) => {
                audioUrl += data.toString().trim();
            });
            
            ytDlpProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            await new Promise((resolve, reject) => {
                ytDlpProcess.on('close', (code) => {
                    if (code === 0 && audioUrl) {
                        resolve();
                    } else {
                        reject(new Error(`yt-dlp failed with code ${code}: ${errorOutput}`));
                    }
                });
            });
            
            // Create audio resource from the extracted URL
            const resource = createAudioResource(audioUrl, {
                inlineVolume: true
            });
            
            this.player.play(resource);
            
            if (this.connection) {
                this.connection.subscribe(this.player);
            }
            
            console.log(`🎵 Now playing: ${this.currentSong.title}`);
            
        } catch (error) {
            console.error('Playback error:', error.message);
            
            // Retry mechanismus pro různé typy chyb
            if (retryCount < 2) {
                console.log(`🔄 Retry attempt ${retryCount + 1}/2...`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Počkáme 2 sekundy
                return this.playSong(song, retryCount + 1);
            }
            
            console.error('❌ Failed to play the song after all attempts, skipping to next...');
            this.playNext();
        }
    }
    
    pause() {
        if (this.isPlaying && !this.isPaused) {
            this.player.pause();
            this.resetInactivityTimer();
            return true;
        }
        return false;
    }
    
    resume() {
        if (this.isPaused) {
            this.player.unpause();
            this.resetInactivityTimer();
            return true;
        }
        return false;
    }
    
    stop() {
        this.queue = [];
        this.currentSong = null;
        this.player.stop();
        this.isPlaying = false;
        this.isPaused = false;
        this.updateControlEmbed();
    }
    
    skip() {
        if (this.currentSong) {
            this.player.stop();
            this.resetInactivityTimer();
            return true;
        }
        return false;
    }
    
    extractVideoId(url) {
        // Podporuje YouTube, YouTube Music, YouTube Shorts a youtu.be URLs
        const regex = /(?:(?:youtube\.com|music\.youtube\.com)\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }
    
    formatDuration(duration) {
        // YouTube API vrací duration ve formátu ISO 8601 (PT4M13S)
        if (typeof duration === 'string' && duration.startsWith('PT')) {
            const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            const hours = parseInt(match[1]) || 0;
            const minutes = parseInt(match[2]) || 0;
            const seconds = parseInt(match[3]) || 0;
            
            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        // Fallback pro číselný formát (sekundy)
        if (typeof duration === 'number') {
            const hours = Math.floor(duration / 3600);
            const minutes = Math.floor((duration % 3600) / 60);
            const secs = duration % 60;
            
            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
        
        return duration || '0:00';
    }
    
    createControlEmbed() {
        const customization = config.customization || {};
        
        const embed = new EmbedBuilder()
            .setColor(customization.embedColor || '#0099ff')
            .setTitle(customization.embedTitle || '🎵 Music Player')
            .setTimestamp();
        
        // Přidání thumbnail - pokud se přehrává písnička, použij její thumbnail, jinak defaultní
        if (this.currentSong && this.currentSong.thumbnail && this.currentSong.thumbnail !== 'NA' && this.currentSong.thumbnail.startsWith('http')) {
            embed.setThumbnail(this.currentSong.thumbnail);
        } else if (customization.embedThumbnail) {
            embed.setThumbnail(customization.embedThumbnail);
        }
        
        // Přidání footer
        if (customization.embedFooterText) {
            embed.setFooter({
                text: customization.embedFooterText,
                iconURL: customization.embedFooterIcon || undefined
            });
        }
        
        // Přidání hlavního obrázku - vždy defaultní z konfigurace
        if (customization.embedImage) {
            embed.setImage(customization.embedImage);
        }
        
        if (this.currentSong) {
            embed.addFields(
                { name: '🎶 Now Playing:', value: this.currentSong.title, inline: false },
                { name: '⏱️ Duration', value: this.currentSong.duration, inline: true },
                { name: '👤 Requested By', value: `<@${this.currentSong.requestedBy.id}>`, inline: true },
                { name: '📊 Status', value: this.isPaused ? '⏸️ Paused' : '▶️ Playing', inline: true }
            );
        } else {
            embed.addFields(
                { name: '🎶 Now Playing:', value: 'Nothing is playing', inline: false },
                { name: '📋 Queue:', value: 'Queue is empty', inline: false }
            );
        }
        
        if (this.queue.length > 0) {
            const queueList = this.queue.slice(0, 10).map((song, index) => 
                `${index + 1}. **${song.title}** - \`${song.duration}\` 👤 <@${song.requestedBy.id}>`
            ).join('\n');
            
            embed.addFields({
                name: `🎵 Playlist (${this.queue.length} songs)`,
                value: queueList + (this.queue.length > 10 ? '\n*...and more*' : ''),
                inline: false
            });
        } else {
            embed.addFields({
                name: '🎵 Playlist',
                value: '*Playlist is empty — add songs using the button below*',
                inline: false
            });
        }
        
        return embed;
    }
    
    createControlButtons() {
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('add_song')
                    .setLabel('➕ Add Song')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('add_next')
                    .setLabel('⏫ Add Next')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('pause_resume')
                    .setLabel(this.isPaused ? '▶️ Resume' : '⏸️ Pause')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(!this.currentSong)
            );
        
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('connect_disconnect')
                    .setLabel(this.connection && this.connection.state.status !== 'destroyed' ? '🔌 Disconnect' : '🔌 Connect')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('skip')
                    .setLabel('⏭️ Skip')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(!this.currentSong),
                new ButtonBuilder()
                    .setCustomId('loop_mode')
                    .setLabel(this.getLoopModeLabel())
                    .setStyle(ButtonStyle.Secondary)
            );
        
        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('clear_playlist')
                    .setLabel('🗑️ Clear Playlist')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(this.queue.length === 0 && !this.currentSong),
                new ButtonBuilder()
                    .setCustomId('download_song')
                    .setLabel('⬇️ Download Song')
                    .setStyle(ButtonStyle.Success)
            );
        
        return [row1, row2, row3];
    }
    
    getLoopModeLabel() {
        switch (this.loopMode) {
            case 'off': return '🔁 Loop off';
            case 'playlist': return '🔁 Loop playlist';
            case 'song': return '🔂 Loop song';
            default: return '🔁 Loop off';
        }
    }
    
    cycleLoopMode() {
        switch (this.loopMode) {
            case 'off':
                this.loopMode = 'playlist';
                break;
            case 'playlist':
                this.loopMode = 'song';
                break;
            case 'song':
                this.loopMode = 'off';
                break;
            default:
                this.loopMode = 'off';
        }
        return this.loopMode;
    }
    
    async addSongNext(url, requestedBy) {
        try {
            let songInfo;
            
            // Extrakce video ID z YouTube URL
            const videoId = this.extractVideoId(url);
            
            if (videoId) {
                // Použití YouTube Data API pro získání informací o videu
                const response = await youtube.videos.list({
                    part: ['snippet', 'contentDetails'],
                    id: [videoId]
                });
                
                if (response.data.items.length === 0) {
                    throw new Error('Video not found!');
                }
                
                const video = response.data.items[0];
                songInfo = {
                    title: video.snippet.title,
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    duration: this.formatDuration(video.contentDetails.duration),
                    thumbnail: video.snippet.thumbnails.maxres?.url || video.snippet.thumbnails.high?.url || video.snippet.thumbnails.default?.url,
                    requestedBy: requestedBy
                };
            } else {
                // Vyhledávání podle názvu
                const searchResults = await YouTube.search(url, { limit: 1, type: 'video' });
                
                if (searchResults.length === 0) {
                    throw new Error('No results were found!');
                }
                
                const video = searchResults[0];
                songInfo = {
                    title: video.title,
                    url: video.url,
                    duration: video.durationFormatted || 'Unknown',
                    thumbnail: video.thumbnail?.url,
                    requestedBy: requestedBy
                };
            }
            
            // Přidat písničku na začátek fronty (přeskočí frontu)
            this.queue.unshift(songInfo);
            
            // Přidání bodu do leaderboardu
            addLeaderboardPoint(requestedBy.id, requestedBy.username || requestedBy.displayName || 'Unknown user');
            // Přidání statistiky písničky
            addSongStat(songInfo.title, songInfo.url);
            
            // Reset inactivity timer při přidání písničky
            this.resetInactivityTimer();
            
            return songInfo;
        } catch (error) {
            throw new Error(`Error adding song: ${error.message}`);
        }
    }
    
    clearPlaylist() {
        this.queue = [];
        if (this.currentSong) {
            this.player.stop();
            this.currentSong = null;
            this.isPlaying = false;
            this.isPaused = false;
        }
        this.updateControlEmbed();
    }
    
    startInactivityTimer() {
        this.clearInactivityTimer();
        
        // Spustit timer pouze pokud není žádná písnička v přehrávání
        if (!this.isPlaying && !this.currentSong && this.queue.length === 0) {
            this.inactivityTimeout = setTimeout(() => {
                console.log(`🔌 Bot automatically disconnects after ${database.settings.disconnectTimeout / 60000} minutes of inactivity (Guild: ${this.guildId})`);
                this.disconnect();
            }, database.settings.disconnectTimeout);
        }
    }
    
    resetInactivityTimer() {
        this.clearInactivityTimer();
        
        // Spustit nový timer pouze pokud není žádná písnička v přehrávání
        if (!this.isPlaying && !this.currentSong && this.queue.length === 0) {
            this.inactivityTimeout = setTimeout(() => {
                console.log(`🔌 Bot automatically disconnects after ${database.settings.disconnectTimeout / 60000} minutes of inactivity (Guild: ${this.guildId})`);
                this.disconnect();
            }, database.settings.disconnectTimeout);
        }
    }
    
    clearInactivityTimer() {
        if (this.inactivityTimeout) {
            clearTimeout(this.inactivityTimeout);
            this.inactivityTimeout = null;
        }
    }
    
    disconnect() {
        this.clearInactivityTimer();
        if (this.connection) {
            this.connection.destroy();
            this.connection = null;
        }
        this.player.stop();
        this.currentSong = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.updateControlEmbed();
    }
    
    async updateControlEmbed() {
        if (this.controlMessage) {
            try {
                await this.controlMessage.edit({
                    embeds: [this.createControlEmbed()],
                    components: this.createControlButtons()
                });
            } catch (error) {
                console.error('Error updating embed message:', error);
            }
        }
    }
}

// Event handlers
client.once('ready', async () => {
console.log(`Bot ${client.user.tag} is ready!`);

    // No command registration. Control panel is managed via auto-send and buttons.

    // Automatické připojení do hlasového kanálu (pokud je nastaveno v configu)
    const targetVoiceChannelId = config.autoJoinVoiceChannelId;
    if (targetVoiceChannelId) {
        try {
            const voiceChannel = await client.channels.fetch(targetVoiceChannelId);
            if (voiceChannel && voiceChannel.isVoiceBased()) {
                const guildId = voiceChannel.guild.id;
                
                // Zkontrolovat, zda je hlasový kanál na povoleném serveru
                if (config.allowedGuildId && guildId !== config.allowedGuildId) {
                    console.error('❌ Voice channel is not on allowed server (allowedGuildId), skipping auto-join.');
                } else {
                    // Vytvoření music playera pro tento server
                    let musicPlayer = musicData.get(guildId);
                    if (!musicPlayer) {
                        musicPlayer = new MusicPlayer(guildId);
                        musicData.set(guildId, musicPlayer);
                    }
                    
                    // Připojení do hlasového kanálu
                    const connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: guildId,
                        adapterCreator: voiceChannel.guild.voiceAdapterCreator
                    });
                    
                    musicPlayer.connection = connection;
                    connection.subscribe(musicPlayer.player);
                    
                    console.log(`🔊 Bot automatically joined channel: ${voiceChannel.name}`);
                }
            } else {
                console.error('❌ Voice channel not found or not a voice channel!');
            }
        } catch (error) {
            console.error('❌ Error connecting to voice channel:', error.message);
        }
    }
    
    // Automatické poslání embed zprávy do zadaného kanálu
    if (config.autoSendChannelId) {
        try {
            const channel = await client.channels.fetch(config.autoSendChannelId);
            if (channel && channel.isTextBased()) {
                // Ověřit, že kanál patří povolenému serveru
                if (config.allowedGuildId && channel.guild.id !== config.allowedGuildId) {
                    console.error('❌ Configured channel is not on allowed server (allowedGuildId), skipping auto-send.');
                } else {
                    // Vytvoření základního music playeru pro tento server
                    const guildId = channel.guild.id;
                    let musicPlayer = musicData.get(guildId);
                    if (!musicPlayer) {
                        musicPlayer = new MusicPlayer(guildId);
                        musicData.set(guildId, musicPlayer);
                    }
                    
                    let message = null;
                    
                    // Pokusit se najít existující embed zprávu
                    if (config.lastEmbedMessageId) {
                        try {
                            message = await channel.messages.fetch(config.lastEmbedMessageId);
                            console.log(`✅ Found existing embed message in channel: ${channel.name}`);
                        } catch (error) {
console.log('⚠️ Previous embed message not found, creating a new one...');
                            message = null;
                        }
                    }
                    
                    // Pokud zpráva nebyla nalezena, vytvoř novou
                    if (!message) {
                        const embed = musicPlayer.createControlEmbed();
                        const buttons = musicPlayer.createControlButtons();
                        
                        message = await channel.send({
                            embeds: [embed],
                            components: buttons
                        });
                        
                        // Uložit ID nové zprávy do config.json
                        config.lastEmbedMessageId = message.id;
                        fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
                        console.log(`✅ New embed message sent to channel: ${channel.name}`);
                    } else {
                        // Aktualizovat existující zprávu
                        const embed = musicPlayer.createControlEmbed();
                        const buttons = musicPlayer.createControlButtons();
                        
                        await message.edit({
                            embeds: [embed],
                            components: buttons
                        });
                        console.log(`✅ Existing embed message updated in channel: ${channel.name}`);
                    }
                    
                    musicPlayer.controlMessage = message;
                    
                    // Nastavit kanál pro leaderboard embedy
                    leaderboardChannelId = channel.id;
                    
                    // Zkusit najít existující leaderboard zprávy
                    try {
                        let userMessage = null;
                        let songMessage = null;
                        
                        // Pokusit se najít existující user leaderboard zprávu
                        if (config.userLeaderboardMessageId) {
                            try {
                                userMessage = await channel.messages.fetch(config.userLeaderboardMessageId);
                                userLeaderboardMessageId = userMessage.id;
                                console.log('✅ Found existing user leaderboard message');
                            } catch (error) {
                                console.log('⚠️ Previous user leaderboard message not found');
                                userMessage = null;
                            }
                        }
                        
                        // Pokusit se najít existující song leaderboard zprávu
                        if (config.songLeaderboardMessageId) {
                            try {
                                songMessage = await channel.messages.fetch(config.songLeaderboardMessageId);
                                songLeaderboardMessageId = songMessage.id;
                                console.log('✅ Found existing song leaderboard message');
                            } catch (error) {
                                console.log('⚠️ Previous song leaderboard message not found');
                                songMessage = null;
                            }
                        }
                        
                        // Vytvořit user leaderboard embed pokud neexistuje
                        if (!userMessage) {
                            const userEmbed = createUserLeaderboardEmbed();
                            userMessage = await channel.send({ embeds: [userEmbed] });
                            userLeaderboardMessageId = userMessage.id;
                            config.userLeaderboardMessageId = userMessage.id;
                            console.log('✅ New user leaderboard message created');
                        } else {
                            // Aktualizovat existující zprávu
                            const userEmbed = createUserLeaderboardEmbed();
                            await userMessage.edit({ embeds: [userEmbed] });
                            console.log('✅ User leaderboard message updated');
                        }
                        
                        // Vytvořit song leaderboard embed pokud neexistuje
                        if (!songMessage) {
                            const songEmbed = createSongLeaderboardEmbed();
                            songMessage = await channel.send({ embeds: [songEmbed] });
                            songLeaderboardMessageId = songMessage.id;
                            config.songLeaderboardMessageId = songMessage.id;
                            console.log('✅ New song leaderboard message created');
                        } else {
                            // Aktualizovat existující zprávu
                            const songEmbed = createSongLeaderboardEmbed();
                            await songMessage.edit({ embeds: [songEmbed] });
                            console.log('✅ Song leaderboard message updated');
                        }
                        
                        // Uložit změny do config.json
                        fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
                        
                    } catch (error) {
                        console.error('❌ Error handling leaderboard embeds:', error.message);
                    }
                }
            } else {
                console.error('❌ Channel not found or not a text channel!');
            }
        } catch (error) {
            console.error('❌ Error handling embed message:', error.message);
        }
    }

});

client.on('interactionCreate', async interaction => {
    
    // Omezit bota na povolený server
    if (config.allowedGuildId && interaction.guildId !== config.allowedGuildId) {
        return;
    }
    
    // No chat input commands; interactions are handled via buttons only
    
    if (interaction.isButton()) {
        // Kontrola oprávnení
        if (!hasPermission(interaction.member)) {
            return interaction.deferUpdate();
        }
        
        const musicPlayer = musicData.get(interaction.guildId);
        if (!musicPlayer) {
            return interaction.deferUpdate();
        }
        
        switch (interaction.customId) {
            case 'add_song':
                // Zkontrolovat, zda je uživatel ve voice kanálu
                const member = interaction.member;
                const voiceChannel = member.voice.channel;
                
                if (!voiceChannel) {
return interaction.reply({ content: 'You must be in a voice channel to add a song.', ephemeral: true });
                }
                
                // Pokud bot přehrává v jiném kanálu, zakázat přidávání
                if (musicPlayer.connection && musicPlayer.connection.joinConfig.channelId !== voiceChannel.id) {
return interaction.reply({ content: 'Bot is already playing music in another channel.', ephemeral: true });
                }
                
                const modal = new ModalBuilder()
                    .setCustomId('add_song_modal')
.setTitle('Add Song');
                
                const urlInput = new TextInputBuilder()
                    .setCustomId('song_url')
                    .setLabel('YouTube URL or song name')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter URL or song name...')
                    .setRequired(true);
                
                const firstActionRow = new ActionRowBuilder().addComponents(urlInput);
                modal.addComponents(firstActionRow);
                
                await interaction.showModal(modal);
                break;
                
            case 'add_next':
                // Zkontrolovat, zda je uživatel ve voice kanálu
                const memberNext = interaction.member;
                const voiceChannelNext = memberNext.voice.channel;
                
                if (!voiceChannelNext) {
return interaction.reply({ content: 'You must be in a voice channel to add a song.', ephemeral: true });
                }
                
                // Pokud bot přehrává v jiném kanálu, zakázat přidávání
                if (musicPlayer.connection && musicPlayer.connection.joinConfig.channelId !== voiceChannelNext.id) {
return interaction.reply({ content: 'Bot is already playing music in another channel.', ephemeral: true });
                }
                
                const modalNext = new ModalBuilder()
                    .setCustomId('add_next_modal')
                    .setTitle('Add Next (skip queue)');
                
                const urlInputNext = new TextInputBuilder()
                    .setCustomId('song_url')
                    .setLabel('YouTube URL or song name')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter URL or song name...')
                    .setRequired(true);
                
                const firstActionRowNext = new ActionRowBuilder().addComponents(urlInputNext);
                modalNext.addComponents(firstActionRowNext);
                
                await interaction.showModal(modalNext);
                break;
                
            case 'pause_resume':
                if (musicPlayer.isPaused) {
                    musicPlayer.resume();
                } else {
                    musicPlayer.pause();
                }
                await interaction.deferUpdate();
                break;
                
            case 'connect_disconnect':
                const memberConnect = interaction.member;
                const voiceChannelConnect = memberConnect.voice.channel;
                
                if (musicPlayer.connection && musicPlayer.connection.state.status !== 'destroyed') {
                    // Odpojit bota
                    musicPlayer.disconnect();
                } else {
                    // Připojit bota
                    if (!voiceChannelConnect) {
                        return interaction.deferUpdate();
                    }
                    
                    try {
                        const connection = joinVoiceChannel({
                            channelId: voiceChannelConnect.id,
                            guildId: interaction.guildId,
                            adapterCreator: interaction.guild.voiceAdapterCreator
                        });
                        
                        musicPlayer.connection = connection;
                        connection.subscribe(musicPlayer.player);
                        musicPlayer.updateControlEmbed();
                    } catch (error) {
                        console.error('Error connecting:', error);
                    }
                }
                await interaction.deferUpdate();
                break;
                
            case 'skip':
                musicPlayer.skip();
                await interaction.deferUpdate();
                break;
                
            case 'loop_mode':
                musicPlayer.cycleLoopMode();
                musicPlayer.updateControlEmbed();
                await interaction.deferUpdate();
                break;
                
            case 'download_song':
                const downloadModal = new ModalBuilder()
                    .setCustomId('download_song_modal')
.setTitle('Download Song');
                
                const downloadUrlInput = new TextInputBuilder()
                    .setCustomId('download_url')
                    .setLabel('YouTube URL')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter YouTube URL...')
                    .setRequired(true);
                
                const downloadActionRow = new ActionRowBuilder().addComponents(downloadUrlInput);
                downloadModal.addComponents(downloadActionRow);
                
                await interaction.showModal(downloadModal);
                break;
                
            case 'clear_playlist':
                musicPlayer.clearPlaylist();
                await interaction.deferUpdate();
                break;
        }
    }
    
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'add_song_modal' || interaction.customId === 'add_next_modal') {
            // Kontrola oprávnění
            if (!hasPermission(interaction.member)) {
return interaction.reply({ content: 'You do not have permission to use this bot.', ephemeral: true });
            }
            
            const musicPlayer = musicData.get(interaction.guildId);
            if (!musicPlayer) {
                return interaction.reply({ content: 'Music player is not initialized.', ephemeral: true });
            }
            
            // Zkontrolujeme, zda je uživatel ve voice kanálu
            const member = interaction.member;
            const voiceChannel = member.voice.channel;
            
            if (!voiceChannel) {
return interaction.reply({ content: 'You must be in a voice channel to add a song.', ephemeral: true });
            }
            
            const songUrl = interaction.fields.getTextInputValue('song_url');
            
            await interaction.deferReply({ ephemeral: true });
            
            try {
                // Připojíme se k voice kanálu, pokud ještě nejsme připojeni
                if (!musicPlayer.connection || musicPlayer.connection.state.status === 'destroyed') {
                    try {
                        const connection = joinVoiceChannel({
                            channelId: voiceChannel.id,
                            guildId: interaction.guildId,
                            adapterCreator: interaction.guild.voiceAdapterCreator
                        });
                        
                        musicPlayer.connection = connection;
                        connection.subscribe(musicPlayer.player);
                        
console.log(`🔊 Bot joined channel: ${voiceChannel.name}`);
                    } catch (connectionError) {
console.error('Error connecting to voice channel:', connectionError);
return interaction.editReply({ content: 'Error connecting to voice channel.' });
                    }
                }
                
                let result;
                if (interaction.customId === 'add_next_modal') {
                    result = await musicPlayer.addSongNext(songUrl, interaction.user);
                } else {
                    result = await musicPlayer.addSong(songUrl, interaction.user);
                }
                
                if (result) {
                    // Písničky přidány úspěšně - smazat odpověď
                    await interaction.deleteReply();
                } else {
await interaction.editReply({ content: '❌ Failed to add song/playlist.' });
                }
            } catch (error) {
console.error('Error adding song:', error);
await interaction.editReply({ content: '❌ Error adding song.' });
            }
        }
        
        if (interaction.customId === 'download_song_modal') {
            // Kontrola oprávnění
            if (!hasPermission(interaction.member)) {
return interaction.reply({ content: 'You do not have permission to use this bot.', ephemeral: true });
            }
            
            const downloadUrl = interaction.fields.getTextInputValue('download_url');
            
            await interaction.deferReply({ ephemeral: true });
            
            try {
                 // Odeslání zprávy o začátku stahování do DM
await interaction.user.send('⬇️ Starting song download...');
await interaction.editReply({ content: '✅ Download started! Check your private messages.' });
                 
                 // Stažení písničky pomocí yt-dlp
                 await downloadAndSendSong(downloadUrl, interaction.user);
                 
             } catch (error) {
console.error('Error downloading song:', error);
await interaction.editReply({ content: '❌ Error downloading song. Check the URL and try again.' });
                 // Pokusit se odeslat chybu i do DM
                 try {
await interaction.user.send('❌ Error downloading song. Check the URL and try again.');
                 } catch (dmError) {
console.error('Failed to send error message to DM:', dmError);
                 }
             }
        }
    }
});

// No text or slash commands. Control via buttons only.

client.on('voiceStateUpdate', (oldState, newState) => {
    // Omezit reakce jen na povolený server
    if (config.allowedGuildId && oldState.guild.id !== config.allowedGuildId) {
        return;
    }
    // Automatické odpojení když bot zůstane sám - s 30minutovým timeoutem
    if (oldState.channelId && !newState.channelId) {
        const channel = oldState.channel;
        if (channel && channel.members.size === 1 && channel.members.has(client.user.id)) {
            const musicPlayer = musicData.get(oldState.guild.id);
            if (musicPlayer && musicPlayer.connection) {
console.log(`🕐 Bot is alone in the channel, will disconnect in ${database.settings.disconnectTimeout / 60000} minutes`);
                
                // Spustit timeout pro odpojení
                setTimeout(() => {
                    const currentChannel = client.channels.cache.get(oldState.channelId);
                    if (currentChannel && currentChannel.members.size === 1 && currentChannel.members.has(client.user.id)) {
                        musicPlayer.connection.destroy();
                        musicPlayer.stop();
console.log('🔌 Bot disconnected — left alone in the channel for 30 minutes');
                    }
                }, database.settings.disconnectTimeout);
            }
        }
    }
});

// Funkce pro stažení a odeslání písničky
async function downloadAndSendSong(url, user) {
    const path = require('path');
    const { AttachmentBuilder } = require('discord.js');
    
    return new Promise((resolve, reject) => {
        // Vytvoření jedinečného názvu souboru s názvem videa
        const timestamp = Date.now();
        const outputTemplate = path.join(__dirname, `${timestamp}_%(title)s.%(ext)s`);
        
        // Spuštění yt-dlp pro stažení MP3
        const ytdlp = spawn('yt-dlp', [
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '192K',
            '--output', outputTemplate,
            '--no-playlist',
            '--max-filesize', '50M', // Limit 50MB kvůli Discord limitu
            '--restrict-filenames', // Bezpečné názvy souborů
            url
        ]);
        
        let stderr = '';
        
        ytdlp.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        ytdlp.on('close', async (code) => {
            if (code !== 0) {
                console.error('yt-dlp error:', stderr);
                return reject(new Error('Download failed'));
            }
            
            try {
                // Najít stažený soubor
                const fs = require('fs');
                const files = fs.readdirSync(__dirname).filter(file => 
                    file.startsWith(`${timestamp}_`) && file.endsWith('.mp3')
                );
                
                if (files.length === 0) {
                    return reject(new Error('Downloaded file not found'));
                }
                
                const filePath = path.join(__dirname, files[0]);
                const stats = fs.statSync(filePath);
                
                // Kontrola velikosti souboru (Discord limit 25MB)
                if (stats.size > 25 * 1024 * 1024) {
                    fs.unlinkSync(filePath); // Smazat soubor
                    return reject(new Error('File is too large (max 25MB)'));
                }
                
                // Odeslání souboru do DM s názvem písničky
                const fileName = path.basename(filePath, '.mp3');
                const songTitle = fileName.replace(`${timestamp}_`, '').replace(/_/g, ' ');
                
                const attachment = new AttachmentBuilder(filePath);
                await user.send({
                    content: `🎵 **${songTitle}**\n✅ Download complete!`,
                    files: [attachment]
                });
                
                // Smazání dočasného souboru
                fs.unlinkSync(filePath);
                
                resolve();
            } catch (error) {
                console.error('Error sending file:', error);
                reject(error);
            }
        });
        
        ytdlp.on('error', (error) => {
            console.error('yt-dlp spawn error:', error);
            reject(new Error('Failed to start yt-dlp'));
        });
    });
}

// Funkce pro kontrolu oprávnění
function hasPermission(member) {
    // Povolit bota používat všem uživatelům
    return true;
}

// Spuštění bota
client.login(config.token);