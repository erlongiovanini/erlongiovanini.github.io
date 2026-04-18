const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// ════════════════════════════════════════════════════════════
// claudeProxy — já existia, mantido como está
// ════════════════════════════════════════════════════════════
exports.claudeProxy = functions.https.onCall(async (data, context) => {
  // Verificar autenticação
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Usuário não autenticado."
    );
  }

  // Verificar se é trainer (custom claim)
  if (!context.auth.token.role || context.auth.token.role !== "trainer") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Apenas o treinador pode usar esta função."
    );
  }

  const { base64Pdf } = data;
  if (!base64Pdf) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "PDF não enviado."
    );
  }

  // API key segura no servidor
  const apiKey = functions.config().claude.key;
  if (!apiKey) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "API key não configurada no servidor."
    );
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64Pdf,
                },
              },
              {
                type: "text",
                text: `Analise este PDF de treino de musculação e extraia as informações em formato JSON.
Retorne APENAS o JSON, sem markdown, sem backticks, sem explicações.
Formato esperado:
{
  "treinos": [
    {
      "nome": "Treino A - Membros Inferiores",
      "exercicios": [
        {
          "nome": "Agachamento Smith",
          "series": "4",
          "reps": "10-12",
          "obs": "Cadência 3-1-1"
        }
      ]
    }
  ],
  "cardio": { "freq": "", "dur": "", "pse": "", "mod": "", "obs": "" },
  "abd": { "freq": "", "ex": "", "series": "", "reps": "", "obs": "" }
}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new functions.https.HttpsError(
        "internal",
        "Erro na API Claude: " + response.status
      );
    }

    const result = await response.json();
    const text = result.content
      .map((c) => c.text || "")
      .filter(Boolean)
      .join("");

    return { result: text };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError(
      "internal",
      "Erro ao processar: " + err.message
    );
  }
});

// ════════════════════════════════════════════════════════════
// autoCadastrarAluna — NOVA (Bloco 4.5 — Auto cadastro da aluna)
// Cria conta no Auth + documento no Firestore via Admin SDK
// (bypassa rules, não depende de session do client)
// ════════════════════════════════════════════════════════════
exports.autoCadastrarAluna = functions.https.onCall(async (data, context) => {
  const { nome, email, senha } = data;

  // Validações básicas
  if (!nome || typeof nome !== "string" || nome.trim().length < 2) {
    throw new functions.https.HttpsError("invalid-argument", "Nome inválido.");
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    throw new functions.https.HttpsError("invalid-argument", "Email inválido.");
  }
  if (!senha || typeof senha !== "string" || senha.length < 6) {
    throw new functions.https.HttpsError("invalid-argument", "Senha muito curta (mínimo 6 caracteres).");
  }

  const db = admin.firestore();
  const auth = admin.auth();
  const emailLimpo = email.trim().toLowerCase();
  const docId = emailLimpo.replace(/[^a-z0-9]/g, "_");

  let uid = null;
  try {
    // 1) Criar usuário no Firebase Auth
    const userRecord = await auth.createUser({
      email: emailLimpo,
      password: senha,
      displayName: nome.trim(),
    });
    uid = userRecord.uid;

    // 2) Calcular inicioSemana1 (próxima segunda se hoje não for seg)
    const hj = new Date();
    const ds = hj.getDay();
    let inicioSemana1;
    if (ds === 1) {
      inicioSemana1 = hj.getTime();
    } else {
      const c = new Date(hj);
      let ad = (1 - ds + 7) % 7;
      if (ad === 0) ad = 7;
      c.setDate(hj.getDate() + ad);
      c.setHours(0, 0, 0, 0);
      inicioSemana1 = c.getTime();
    }

    // 3) Criar documento no Firestore
    await db.collection("alunas").doc(docId).set({
      nome: nome.trim(),
      email: emailLimpo,
      uid: uid,
      status: "ativa",
      plano: "",
      inicio: new Date().toLocaleDateString("pt-BR"),
      fim: "",
      objetivo: "",
      semAtual: 1,
      semTotal: 6,
      numPlanilha: 1,
      inicioSemana1: inicioSemana1,
      criadoEm: new Date().toLocaleDateString("pt-BR"),
      autoCadastro: true,
    });

    return { success: true, alunaId: docId, uid: uid };
  } catch (err) {
    // Rollback: se criou no Auth mas falhou no Firestore, apagar o usuário órfão
    if (uid) {
      try { await auth.deleteUser(uid); } catch (e) {}
    }

    // Tratar erros específicos
    if (err.code === "auth/email-already-exists" || err.code === "auth/email-already-in-use") {
      throw new functions.https.HttpsError("already-exists", "Este email já está cadastrado.");
    }
    if (err.code === "auth/invalid-email") {
      throw new functions.https.HttpsError("invalid-argument", "Email inválido.");
    }
    if (err.code === "auth/weak-password") {
      throw new functions.https.HttpsError("invalid-argument", "Senha muito fraca.");
    }
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", "Erro ao criar conta: " + (err.message || "desconhecido"));
  }
});

// ════════════════════════════════════════════════════════════
// deletarAlunaCompleta — NOVA (Bloco 4.5)
// Apaga aluna do Firestore + Firebase Auth + Storage (pasta anamnese/{id})
// ════════════════════════════════════════════════════════════
exports.deletarAlunaCompleta = functions.https.onCall(async (data, context) => {
  // Só o trainer pode apagar
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Usuário não autenticado."
    );
  }
  if (!context.auth.token.role || context.auth.token.role !== "trainer") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Apenas o treinador pode excluir alunas."
    );
  }

  const { alunaId } = data;
  if (!alunaId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "alunaId é obrigatório."
    );
  }

  const db = admin.firestore();
  const storage = admin.storage().bucket();
  const auth = admin.auth();

  const resultado = {
    firestore: false,
    auth: false,
    storage: false,
    avisos: [],
  };

  try {
    // 1) Ler documento pra pegar o uid antes de apagar
    const docRef = db.collection("alunas").doc(alunaId);
    const snap = await docRef.get();

    if (!snap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Aluna não encontrada no Firestore."
      );
    }

    const dados = snap.data();
    const uid = dados.uid || null;

    // 2) Apagar pasta anamnese/{alunaId}/ do Storage (se existir)
    try {
      const [arquivos] = await storage.getFiles({ prefix: `anamnese/${alunaId}/` });
      if (arquivos.length > 0) {
        await Promise.all(arquivos.map(f => f.delete().catch(() => null)));
      }
      resultado.storage = true;
    } catch (errStorage) {
      resultado.avisos.push("Storage: " + errStorage.message);
    }

    // 3) Apagar usuário do Firebase Auth (se tiver uid)
    if (uid) {
      try {
        await auth.deleteUser(uid);
        resultado.auth = true;
      } catch (errAuth) {
        // Se o usuário não existe mais no Auth, tudo bem — continua
        if (errAuth.code === "auth/user-not-found") {
          resultado.avisos.push("Auth: usuário já não existia.");
          resultado.auth = true;
        } else {
          resultado.avisos.push("Auth: " + errAuth.message);
        }
      }
    } else {
      resultado.avisos.push("Auth: documento não tinha uid salvo — nada pra apagar.");
    }

    // 4) Apagar documento do Firestore (por último — é o ponto de não retorno)
    await docRef.delete();
    resultado.firestore = true;

    return resultado;
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError(
      "internal",
      "Erro ao deletar aluna: " + err.message
    );
  }
});
