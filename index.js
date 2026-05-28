const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// URL PANEL PTERODACTYL KAMU
const PANEL_URL = "https://oline.jkt48-private.com";

// APPLICATION API KEY BARU
const API_KEY = "ptla_UaqnPQ4fouJiPbot5ur6LFk0ja0Qb0BKOII1cyxIylQ";

app.get("/", (req, res) => {
  res.send("Backend Cyra Store Aktif!");
});

// =========================
// CREATE PANEL & SERVER
// =========================
app.post("/create-panel", async (req, res) => {
  try {
    const { username, ram, nodeVersion } = req.body;

    if (!username || ram === undefined) {
      return res.status(400).json({
        success: false,
        error: "Username dan RAM wajib diisi"
      });
    }

    // Mengatur nama pembuat dan format text
    const baseUsername = username.toLowerCase().replace(/\s+/g, "");
    
    // Password otomatis dikasih simbol aman agar pasti lolos regulasi panel
    const password = `${baseUsername}123*`; 

    // Bikin email unik otomatis biar anti-bentrok user admin
    const systemSuffix = Math.floor(1000 + Math.random() * 9000);
    const systemUsername = `${baseUsername}${systemSuffix}`;
    const systemEmail = `${baseUsername}${systemSuffix}@cyrastore.com`;

    // Mengambil versi Node dari HTML (Jika kosong, default ke versi 18)
    const version = nodeVersion || "18";
    const selectedDockerImage = `ghcr.io/parkervcp/yolks:nodejs_${version}`;

    // =========================
    // 1. PROSES CREATE USER BARU (PEMBELI)
    // =========================
    const userRes = await axios.post(
      `${PANEL_URL}/api/application/users`,
      {
        email: systemEmail, 
        username: systemUsername,
        first_name: username,
        last_name: "Store",
        password: password,
        root_admin: false
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "Application/vnd.pterodactyl.v1+json",
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0"
        }
      }
    );

    // Ambil ID User Pembeli yang baru saja sukses terdaftar
    const userId = userRes.data.attributes.id;

    // =========================
    // 2. OTOMATIS SCANNING PORT KOSONG (RANGE 3095 - 3800)
    // =========================
    const nodeAllocations = await axios.get(
      `${PANEL_URL}/api/application/nodes/1/allocations?per_page=1000`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "Application/vnd.pterodactyl.v1+json"
        }
      }
    );

    // Cari alokasi yang 'assigned === false' dan nomor port-nya ada di rentang 3095-3800
    const availableAllocation = nodeAllocations.data.data.find((alloc) => {
      const portNumber = Number(alloc.attributes.port);
      return alloc.attributes.assigned === false && portNumber >= 3095 && portNumber <= 3800;
    });

    if (!availableAllocation) {
      return res.status(400).json({
        success: false,
        error: "Slot port kosong dari range 3095-3800 sudah penuh! Silakan tambah alokasi port baru di Pterodactyl."
      });
    }

    const allocationId = availableAllocation.attributes.id;
    const finalPort = availableAllocation.attributes.port;

    let ramLimit = Number(ram);
    if (ramLimit === 0) ramLimit = 0; 

    // =========================
    // 3. PROSES CREATE SERVER (MENGIKAT USER ID PEMBELI)
    // =========================
    const serverRes = await axios.post(
      `${PANEL_URL}/api/application/servers`,
      {
        name: username,
        user: userId, // Server ini otomatis dikunci ke ID Pembeli agar tidak kosong saat mereka login
        nest: 5,      // Sesuai dengan ID Nest baru kamu
        egg: 15,      // Sesuai dengan ID Egg baru kamu
        docker_image: selectedDockerImage, // Mengikuti versi NodeJS 1-24 pilihan pembeli
        startup: "if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == \"1\" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; if [[ ! -z ${CUSTOM_ENVIRONMENT_VARIABLES} ]]; then vars=$(echo ${CUSTOM_ENVIRONMENT_VARIABLES} | tr \";\" \"\\n\"); for line in $vars; do export $line; done fi; /usr/local/bin/${CMD_RUN};",
        environment: {
          GIT_ADDRESS: "",
          BRANCH: "",
          USERNAME: "",
          ACCESS_TOKEN: "",
          CMD_RUN: "npn start" // Menggunakan perintah startup panel baru kamu (npn start)
        },
        limits: {
          memory: ramLimit,
          swap: 0,
          disk: 1024,
          io: 500,
          cpu: 100
        },
        feature_limits: {
          databases: 1,
          allocations: 1,
          backups: 1
        },
        allocation: {
          default: allocationId // Menggunakan port kosong dari hasil filter otomatis di atas
        }
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "Application/vnd.pterodactyl.v1+json",
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0"
        }
      }
    );

    // =========================
    // DATA BALIKAN YANG DIKIRIM KE HTML WEBMU
    // =========================
    return res.json({
      success: true,
      username: systemUsername, 
      password: password,       
      ram: ramLimit === 0 ? "UNLIMITED" : ramLimit,
      node_version: version,
      domain: PANEL_URL,
      port: finalPort,
      server_id: serverRes.data.attributes.id
    });

  } catch (err) {
    console.log("========== LOG ERROR PTERODACTYL ==========");
    console.log(JSON.stringify(err.response?.data, null, 2));

    return res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
});

// RUN BACKEND DI PORT 5000
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend Cyra Store running on port ${PORT}`);
});
