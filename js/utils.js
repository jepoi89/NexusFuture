/**
 * Technical Utilities & Helpers for NEXUS Futures Dashboard
 */

/**
 * Format numbers with fixed decimals based on size
 * @param {number} num - The number to format
 * @param {number} decimals - Max decimals (optional)
 * @returns {string} Formatted number
 */
export function formatPrice(num, decimals = null) {
    if (num === null || num === undefined || isNaN(num)) return '---';
    const val = parseFloat(num);
    if (decimals !== null) return val.toFixed(decimals);
    // Standardize token prices to exactly 4 decimal places for values >= 0.01
    if (val >= 0.01) return val.toFixed(4);
    return val.toFixed(8);
}

/**
 * Format Large volume figures to K, M, B
 * @param {number} num - Large number
 * @returns {string} Short formatted string
 */
export function formatVolume(num) {
    if (num === null || num === undefined || isNaN(num)) return '---';
    const val = parseFloat(num);
    if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return (val / 1e3).toFixed(2) + 'K';
    return val.toFixed(2);
}

/**
 * Format percentage change values
 * @param {number} num - Percent decimal (e.g. 1.25)
 * @returns {string} Formatted percentage
 */
export function formatPercent(num) {
    if (num === null || num === undefined || isNaN(num)) return '0.00%';
    const val = parseFloat(num);
    const prefix = val > 0 ? '+' : '';
    return prefix + val.toFixed(2) + '%';
}

/**
 * Safely parse float values
 * @param {any} val 
 * @returns {number}
 */
export function safeFloat(val) {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Debounce utility to rate-limit inputs or queries
 * @param {Function} func 
 * @param {number} wait 
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
