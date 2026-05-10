import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  deleteUser
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  deleteDoc
} from "firebase/firestore";

// Firebase configuration from .env
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TEST_EMAIL = "premium-test-user@pixtool.in";
const TEST_PASSWORD = "Password123!";

async function setup() {
  console.log("🚀 Starting Premium API Test Setup...");
  
  let user;
  try {
    console.log(`Checking if test user ${TEST_EMAIL} exists...`);
    const userCredential = await signInWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
    user = userCredential.user;
    console.log("✅ Existing test user found.");
  } catch (error) {
    if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
      console.log("Creating new test user...");
      const userCredential = await createUserWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
      user = userCredential.user;
      console.log("✅ New test user created.");
    } else {
      throw error;
    }
  }

  const userId = user.uid;
  console.log(`User ID: ${userId}`);

  // 1. Ensure user_subscription doc exists (Free by default)
  const subRef = doc(db, "user_subscriptions", userId);
  await setDoc(subRef, {
    user_id: userId,
    full_name: "Premium Test User",
    email: TEST_EMAIL,
    tier: "free", // Will be upgraded manually by user
    is_active: true,
    is_banned: false,
    subscription_active: true,
    subscription_started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    role: "user"
  }, { merge: true });
  console.log("✅ User subscription initialized (Tier: free).");

  // 2. Generate API Key
  const apiKeyString = `dlm_${crypto.randomUUID().replace(/-/g, "")}`;
  const keyRef = await addDoc(collection(db, "api_keys"), {
    user_id: userId,
    name: "Verification Key",
    key: apiKeyString,
    is_active: true,
    last_used_at: null,
    created_at: new Date().toISOString(),
  });
  
  console.log("\n" + "=".repeat(50));
  console.log("🎉 SETUP COMPLETE");
  console.log("=".repeat(50));
  console.log(`TEST USER ID: ${userId}`);
  console.log(`TEST EMAIL:   ${TEST_EMAIL}`);
  console.log(`API KEY:      ${apiKeyString}`);
  console.log("=".repeat(50));
  console.log("\nNEXT STEPS:");
  console.log(`1. Go to Firebase Console -> Firestore -> user_subscriptions -> ${userId}`);
  console.log("2. Change 'tier' from 'free' to 'pro'");
  console.log("3. Run the test script: bash test-api.sh");
  console.log("=".repeat(50));
}

setup().catch(err => {
  console.error("❌ Setup failed:", err);
  process.exit(1);
});
