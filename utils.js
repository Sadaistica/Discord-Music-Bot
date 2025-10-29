const { EmbedBuilder } = require('discord.js');

function formatDuration(seconds) {
    if (!seconds && seconds !== 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function isValidYouTubeUrl(url) {
    const youtubeRegex = /^(https?\:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return youtubeRegex.test(url);
}

function truncateText(text, maxLength = 50) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

function createProgressBar(current, total, length = 20) {
    const progress = Math.max(0, Math.min(1, total ? current / total : 0));
    const filled = Math.round(progress * length);
    return '▰'.repeat(filled) + '▱'.repeat(length - filled);
}

function escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/[*_`~|\\]/g, '\\$&');
}

function log(message, level = 'INFO') {
    const timestamp = new Date().toLocaleString('en-US');
    const prefix = { 'INFO': '📝', 'ERROR': '❌', 'WARN': '⚠️', 'SUCCESS': '✅' }[level] || '📝';
    console.log(`[${timestamp}] ${prefix} ${message}`);
}

function hasPermission(member) {
    // Basic version: allowed for everyone
    return true;
}

function createErrorEmbed(title, description) {
    return new EmbedBuilder().setColor('#ff0000').setTitle(`❌ ${title}`).setDescription(description).setTimestamp();
}

function createSuccessEmbed(title, description) {
    return new EmbedBuilder().setColor('#00ff00').setTitle(`✅ ${title}`).setDescription(description).setTimestamp();
}

function parsePlaylistUrl(url) {
    const playlistRegex = /[&?]list=([a-zA-Z0-9_-]+)/;
    const match = url.match(playlistRegex);
    return match ? match[1] : null;
}

function isNumber(str) {
    return !isNaN(str) && !isNaN(parseFloat(str));
}

module.exports = {
    formatDuration,
    isValidYouTubeUrl,
    truncateText,
    createProgressBar,
    escapeMarkdown,
    log,
    hasPermission,
    createErrorEmbed,
    createSuccessEmbed,
    parsePlaylistUrl,
    isNumber
};