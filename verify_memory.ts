import { getKnowledgeExtractor } from './src/lib/memory/knowledgeExtractor.ts';

async function verifyMemory() {
  console.log("🧠 Starting Memory Verification...");
  const extractor = getKnowledgeExtractor();
  extractor.clear();

  // Test 1: Preference Extraction
  console.log("\n--- Test 1: Preference Extraction ---");
  const prefText = "I love drinking bitter coffee while coding in React.";
  const extractedPrefs = await extractor.extract(prefText);
  console.log("Extracted:", extractedPrefs.map(f => `${f.predicate} ${f.object}`));
  
  const matchesPref = extractedPrefs.some(p => 
    p.type === 'preference' && 
    p.predicate === 'like' && 
    p.object.includes('coffee')
  );
  
  if (matchesPref) {
    console.log("✅ Successfully extracted coffee preference!");
  } else {
    console.log("❌ Failed to extract coffee preference.");
  }

  // Test 2: Contextual Fact & Conflict Resolution
  console.log("\n--- Test 2: Conflict Resolution ---");
  await extractor.extract("I live in San Francisco.");
  
  // Adding more facts to ensure consolidation/limit checks might trigger if needed,
  // but my fix makes it consolidate on every extraction.
  await extractor.extract("I am a software engineer.");
  await extractor.extract("I enjoy hiking on weekends.");
  
  console.log("Added: San Francisco, engineer, hiking.");
  
  // Now move
  await extractor.extract("Actually, I moved. I live in New York now.");
  console.log("Added: Moved to New York.");

  const facts = extractor.query("where do I live", 5);
  console.log("Query Results for 'where do I live':", facts.map(f => `${f.subject} ${f.predicate} ${f.object} (conf: ${f.confidence.toFixed(2)})`));

  const nycFact = facts.find(f => f.object.toLowerCase().includes("new york"));
  const sfFact = extractor.graph.facts.find(f => f.object.toLowerCase().includes("san francisco"));

  if (nycFact) {
    console.log("✅ Found New York fact!");
  } else {
    console.log("❌ New York fact NOT found in query results.");
  }

  if (sfFact) {
    console.log(`SF Fact Confidence: ${sfFact.confidence.toFixed(2)}`);
    if (sfFact.confidence < 1.0) {
      console.log("✅ Conflict resolution decayed the older fact's confidence!");
    } else {
      console.log("❌ SF fact confidence remains 1.0. Consolidation might not have triggered properly or conflict not detected.");
      // Debug info
      console.log("All current facts:");
      extractor.graph.facts.forEach(f => console.log(`- ${f.subject} ${f.predicate} ${f.object} (type: ${f.type})`));
    }
  } else {
    console.log("❓ SF Fact missing entirely - might have been overwritten.");
  }

  // Test 3: Entity Discovery
  console.log("\n--- Test 3: Entity Discovery ---");
  const entityText = "I met with Alice and Bob yesterday. Alice mentions she uses VSCode.";
  await extractor.extract(entityText);
  
  const people = extractor.getAllPeople();
  const alice = extractor.findPerson("Alice");
  const bob = extractor.findPerson("Bob");

  if (alice && bob) {
    console.log(`✅ Discovered people: ${alice.name} (mentions: ${alice.mentionCount}), ${bob.name}`);
  } else {
    console.log(`❌ Failed to discover people. Found: ${people.map(p => p.name).join(", ")}`);
  }

  // Test 4: camelCase Tokenization (Technical Entities)
  console.log("\n--- Test 4: camelCase Tokenization ---");
  const techText = "I am using the useChatCompanion hook for state management.";
  await extractor.extract(techText);
  
  // Check if "useChatCompanion" is indexed as an entity
  const searchResults = extractor.query("useChatCompanion", 5);
  const foundTech = searchResults.some(f => 
    f.object.toLowerCase().includes("usechatcompanion") || 
    f.predicate.toLowerCase().includes("usechatcompanion") ||
    f.subject.toLowerCase().includes("usechatcompanion")
  );

  if (foundTech) {
    console.log("✅ Successfully indexed camelCase technical entity!");
  } else {
    console.log("❌ camelCase entity not found in query results.");
    console.log("Top query results for 'useChatCompanion':", searchResults.map(r => `${r.subject} ${r.predicate} ${r.object}`));
  }

  console.log("\n--- Verification Summary ---");
  const stats = extractor.getStats();
  console.log(`Total Facts: ${stats.totalFacts}`);
  console.log(`Total People: ${stats.totalPeople}`);
  console.log(`Total Preferences: ${stats.totalPreferences}`);
  console.log("--- End of Verification ---");
}

verifyMemory().catch(console.error);
