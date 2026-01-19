function cleanTitle(title: string): string {
    if (!title) return "Anime Update";

    let clean = title;

    // 1. Remove Brackets and Parentheses and their content
    clean = clean.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '');

    // 2. Remove "TV Anime", "The Anime", "The Series" filler
    clean = clean.replace(/TV Anime/gi, 'Anime')
        .replace(/The Anime/gi, 'Anime')
        .replace(/The Series/gi, '');

    // 3. Remove "Community" / "Fans" unless essential
    if (clean.includes('Community')) {
        // Soft ban: replace with specific if possible or generic "Buzz"
        clean = clean.replace(/Community/gi, 'Fans');
    }

    // 4. Remove common RSS junk
    clean = clean.replace(/News:/gi, '')
        .replace(/Create/gi, '') // "Create a..."
        .replace(/Vote/gi, '')
        .replace(/Poll/gi, '');

    // 5. Remove questions
    clean = clean.replace(/\?/g, '');

    // 6. Formatting: Remove extra spaces, em dashes
    clean = clean.replace(/\s+/g, ' ').trim();
    // Remove leading/trailing non-alphanumeric (like - or :)
    clean = clean.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');

    // 7. Enforce Action/Status framing if missing (Simple Heuristic)
    // If it's just a name "One Piece", maybe add nothing (could be unsafe to guess).
    // But user wants "Anime Name + Action".
    // We assume the input title usually has it.

    // 8. Hard Length Cap for Image Safety (approx 50 chars preferred)
    if (clean.length > 65) {
        // Try to truncate at last space
        const truncated = clean.substring(0, 65);
        clean = truncated.substring(0, truncated.lastIndexOf(' ')) + '...';
    }

    return clean;
}

const testCases = [
    "FX Fighter Kurumi-chan Anime Announced",
    "Ascendance of a Bookworm Season 4 Visual",
    "Lesbian Sex Android Sparks Debate",
    "Frieren: Beyond Journey's End (TV Anime) Season 2 Confirmed",
    "The Anime Community is reacting to Kagurabachi",
    "[News] Solo Leveling Arise Game Launch Date?",
    "My Hero Academia: You're Next Film (Movie) Trailer Revealed",
    "Very Long Title That Goes On And On And On And On And On And On And On And On And On And On And On And On And On And On And On And On"
];

console.log("--- TITLE CLEANING TEST ---");
testCases.forEach(t => {
    console.log(`IN:  ${t}`);
    console.log(`OUT: ${cleanTitle(t)}`);
    console.log("---");
});
