import { db } from "./firebaseAdmin.mjs";

export default async (req) => {
  try {
    const body = await req.json();
    const { uid, displayName, email } = body;

    if (!uid) {
      return new Response(JSON.stringify({ error: "uid가 필요합니다." }), { status: 400 });
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      await userRef.set({
        displayName,
        email,
        balance: 10000,
        createdAt: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ created: true, balance: 10000 }), { status: 200 });
    }

    return new Response(JSON.stringify({ created: false, balance: userSnap.data().balance }), { status: 200 });
  } catch (error) {
    console.error("유저 초기화 에러:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
