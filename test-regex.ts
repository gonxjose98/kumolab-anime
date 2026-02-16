
const actionVerbs = ['screens', 'unveils', 'casts', 'announces', 'teases', 'reveals', 'releases', 'opens', 'sets', 'drops', 'debuts'];
const rawTitle = "Voice Actress Nao Toyama Announces Upcoming Hiatus from Music";
const verbRegex = new RegExp(`\\b(${actionVerbs.join('|')})\\b`, 'i');
const verbMatch = rawTitle.match(verbRegex);

if (verbMatch && verbMatch.index !== undefined) {
    const earliestVerbIdx = verbMatch.index;
    const matchedVerb = verbMatch[0].toLowerCase();
    const subject = rawTitle.substring(0, earliestVerbIdx).trim();
    const object = rawTitle.substring(earliestVerbIdx + matchedVerb.length).trim();
    console.log(`Subject: "${subject}"`);
    console.log(`Object: "${object}"`);
} else {
    console.log("No match found");
}
