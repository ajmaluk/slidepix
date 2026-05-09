import { buildContextWindow } from "./contextManager";
import { Message } from "./chat";

/**
 * Context Testing Suite
 * 
 * Verifies the context manager's ability to handle diverse data types:
 * 1. Tabular data (CSVs, Tables)
 * 2. Large text documents (Notes)
 * 3. Mixed content (Code, Lists)
 * 4. Large history datasets
 */

export async function runContextTests() {
  console.log("🧪 Starting Context Intelligence Tests...");

  const currentConvId = "test-conv-1";

  // Test Case 1: Tabular Data Integrity
  const tabularContent = `ID,Name,Email,Department,Salary
1,Alice,alice@example.com,Engineering,120000
2,Bob,bob@example.com,Design,110000
3,Charlie,charlie@example.com,Marketing,95000
4,David,david@example.com,Engineering,130000
5,Eve,eve@example.com,HR,90000`;

  const messages1: Message[] = [
    {
      id: "m1",
      role: "user",
      content: "Here is the employee dataset:\n" + tabularContent,
      timestamp: new Date(Date.now() - 100000)
    }
  ];

  console.log("--- Testing Tabular Data ---");
  const ctx1 = buildContextWindow(messages1, "What is David's salary?", [], currentConvId);
  const foundTable = ctx1.messages.some(m => m.content.includes("David") && m.content.includes("Salary"));
  console.log(foundTable ? "✅ Tabular retrieval successful" : "❌ Tabular retrieval failed");

  // Test Case 2: Large Notes Chunking
  const largeNote = "This is a very long note about artificial intelligence. ".repeat(100);
  const messages2: Message[] = [
    {
      id: "m2",
      role: "user",
      content: largeNote,
      timestamp: new Date(Date.now() - 200000)
    }
  ];

  console.log("--- Testing Large Note Chunking ---");
  const ctx2 = buildContextWindow(messages2, "Tell me about artificial intelligence", [], currentConvId);
  console.log(ctx2.messages.length > 0 ? `✅ Large note handled (${ctx2.messages.length} fragments)` : "❌ Large note failed");

  // Test Case 3: Mixed Content (Code + Lists)
  const mixedContent = `
Check this code:
\`\`\`typescript
function add(a: number, b: number) {
  return a + b;
}
\`\`\`
And this list:
- Priority 1: Performance
- Priority 2: Security
- Priority 3: Scalability
`;
  const messages3: Message[] = [
    {
      id: "m3",
      role: "user",
      content: mixedContent,
      timestamp: new Date(Date.now() - 300000)
    }
  ];

  console.log("--- Testing Mixed Content ---");
  const ctx3 = buildContextWindow(messages3, "What are the priorities?", [], currentConvId);
  const foundList = ctx3.messages.some(m => m.content.includes("Priority") && m.content.includes("Performance"));
  console.log(foundList ? "✅ Mixed content retrieval successful" : "❌ Mixed content retrieval failed");

  // Test Case 4: Deep Search Across Infinite Data (Stress Test)
  console.log("--- Testing Infinite Data Search ---");
  const hugeMessages: Message[] = Array.from({ length: 50 }, (_, i) => ({
    id: `huge-${i}`,
    role: i % 2 === 0 ? "user" : "assistant",
    content: `This is message number ${i}. It contains unique token: ${i === 25 ? "X-INFINITE-TARGET-X" : "filler-data-" + i}. ` + "Some random technical content about networking and protocols. ".repeat(10),
    timestamp: new Date(Date.now() - (50 - i) * 60000)
  }));

  const ctx4 = buildContextWindow(hugeMessages, "Find the unique infinite target token", [], currentConvId);
  const foundTarget = ctx4.messages.some(m => m.content.includes("X-INFINITE-TARGET-X"));
  console.log(foundTarget ? "✅ Deep search across 50 messages successful" : "❌ Deep search failed");

  // Test Case 5: CSV Statistics Query
  console.log("--- Testing CSV Statistics Retrieval ---");
  const csvData = `Date,Category,Amount,Description
2024-01-01,Food,50.00,Grocery Store
2024-01-02,Rent,1500.00,Monthly Apartment
2024-01-03,Food,25.50,Lunch at Cafe
2024-01-04,Travel,300.00,Flight Ticket
2024-01-05,Food,15.00,Coffee and Snack`;

  const messages5: Message[] = [{ id: "m5", role: "user", content: "My expense report:\n" + csvData, timestamp: new Date() }];
  const ctx5 = buildContextWindow(messages5, "What was the total spent on Food?", [], currentConvId);
  const foundCSV = ctx5.messages.some(m => m.content.includes("Food") && m.content.includes("25.50"));
  console.log(foundCSV ? "✅ CSV data awareness successful" : "❌ CSV data awareness failed");

  console.log("🧪 Context Intelligence Tests Completed.");
}

// Automatically run tests if this is executed directly in a dev environment
if (import.meta.env.DEV) {
  runContextTests();
}
