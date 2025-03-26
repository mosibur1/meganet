const WebSocket = require("ws");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const colors = require("colors");
const { loadData, getRandomNumber, sleep } = require("./utils");
const { SocksProxyAgent } = require("socks-proxy-agent");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { ethers } = require("ethers");
const { config } = require("./config");
const WS_URL = "wss://metamask-sdk.api.cx.metamask.io/socket.io/?EIO=4&transport=websocket";
const API_BASE_URL = "https://api.meganet.app";
const CHANNEL_ID = "9ff14555-f33a-4444-a211-5ba52cf9460d";

const headers = {
  accept: "*/*",
  "accept-language": "en-US,en;q=0.9",
  "sec-ch-ua": '"Chromium";v="134", "Not:A-Brand";v="24", "Brave";v="134"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  "sec-gpc": "1",
  Referer: "https://meganet.app/",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
};

const wsHeaders = {
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "sec-websocket-extensions": "permessage-deflate; client_max_window_bits",
  "sec-websocket-version": "13",
};

function getFormattedDateTime() {
  const now = new Date();
  return now.toLocaleString();
}

// class APIClient {
//   constructor(address, proxy, index) {
//     this.address = address;
//     this.proxyIP = proxy; // Set proxy IP here
//     this.index = index;
//   }
// }

async function newAgent(proxy) {
  if (!proxy) return null;
  try {
    let agent = null;
    if (proxy.startsWith("http://")) {
      agent = new HttpsProxyAgent(proxy);
    } else if (proxy.startsWith("sock")) agent = new SocksProxyAgent(proxy);
    else {
      console.error(colors.red(`Invalid proxy format: ${proxy}`));
      return null;
    }
    return agent;
  } catch (error) {
    console.error(colors.red(`Proxy ${proxy} failed: ${error.message}`));
    return null;
  }
}

async function updateUpTime(address, idWallet, proxy, proxyIP, index) {
  try {
    const url = `${API_BASE_URL}/wallets/uptime/${idWallet}`;
    const agent = await newAgent(proxy);
    const response = await axios({
      method: "PATCH",
      url: url,
      headers: headers,
      ...(agent ? { httpsAgent: agent } : {}),
    });

    if (response.data?.status == 200) {
      console.log(`[Acc ${index}][${address}][${proxyIP}] ${JSON.stringify(response.data)}`.green);
    } else {
      console.log(`[Acc ${index}][${address}][${proxyIP}] ${JSON.stringify(response.data)}`.yellow);
    }
  } catch (err) {
    console.error(colors.red(`[Acc ${index}][${address}][${proxyIP}] Uptime failed: ${err.message}`.red));
  }
}

async function completeTask(address, idWallet, idTask, proxy, proxyIP, index) {
  try {
    const url = `${API_BASE_URL}/wallets/task/${idWallet}/${idTask}`;
    const agent = await newAgent(proxy);
    const response = await axios({
      method: "PATCH",
      url: url,
      headers: headers,
      ...(agent ? { httpsAgent: agent } : {}),
    });

    if (response.data[idTask] == true) {
      console.log(`[Acc ${index}][${address}][${proxyIP}] Task ${idTask} completed!`.green);
      return;
    } else {
      console.log(`[Acc ${index}][${address}][${proxyIP}] Task ${idTask} not completed yet...`.yellow);
    }
  } catch (err) {
    console.error(colors.red(`[Acc ${index}][${address}][${proxyIP}] Failed to complete task ${idTask} information: ${err.message}`.red));
  }
}

async function handleTask(address, idWallet, proxy, proxyIP, index) {
  try {
    const url = `${API_BASE_URL}/wallets/task/${idWallet}`;
    console.log(`[Acc ${index}][${address}][${proxyIP}] Fetching task information...`.blue);
    const agent = await newAgent(proxy);
    const response = await axios({
      method: "GET",
      url: url,
      headers: headers,
      ...(agent ? { httpsAgent: agent } : {}),
    });

    const tasks = Object.entries(response.data || {})
      .filter(([key, value]) => key !== "_id" && value === false && !config.skip_tasks.includes(key))
      .map(([key, value]) => ({ id: key, isDone: value }));

    for (const task of tasks) {
      await sleep(1);
      console.log(`[Acc ${index}][${address}][${proxyIP}] Completing task ${task.id}...`.blue);
      await retryableApiCall(completeTask, address, idWallet, task.id, proxy, proxyIP, index);
    }
  } catch (err) {
    console.error(colors.red(`[Acc ${index}][${address}][${proxyIP}] Failed to fetch task information: ${err.message}`.red));
  }
}

async function getPointsFromWalletInfo(address, proxy, proxyIP, index) {
  try {
    const url = `${API_BASE_URL}/wallets?address=${address}`;
    console.log(`[Acc ${index}][${address}][${proxyIP}] Fetching wallet information...`.blue);
    const agent = await newAgent(proxy);
    const response = await axios({
      method: "GET",
      url: url,
      headers: headers,
      ...(agent ? { httpsAgent: agent } : {}),
    });

    if (response.data && response.data.point) {
      const pointData = response.data.point;
      const { xp, uptime, level, nodeTier } = response.data;

      const todayPoints = pointData.pointsFarmToday || 0;

      const lastPointsData = {
        today: todayPoints.toString(),
        points: (pointData.totalPointsReceived || 0).toString(),
        pointsPerMinute: (pointData.pointsPerMinutes || 0).toString(),
      };

      console.log(
        `[Acc ${index}][${address}][${proxyIP}] XP: ${xp} | Level: ${level} | Points Today: ${lastPointsData.today} | Points Earned (All time): ${
          lastPointsData.points
        } | Last Updated: ${getFormattedDateTime()}`.magenta
      );

      return { success: true, data: response.data };
    } else {
      console.error(`[Acc ${index}][${address}][${proxyIP}] Invalid wallet data format received`.red);
      return { success: false, error: "Invalid data format" };
    }
  } catch (error) {
    console.error(`[Acc ${index}][${address}][${proxyIP}] Error fetching wallet information: ${error.message}`.red);
    return { success: false, error: error.message };
  }
}

async function connectMetaMaskWebSocket(address, proxy, proxyIP, index) {
  console.log(`[Acc ${index}][${address}][${proxyIP}] Connecting to MetaMask WebSocket for bandwidth sharing...`.blue);

  const agent = await newAgent(proxy);
  const ws = new WebSocket(WS_URL, {
    headers: wsHeaders,
    ...(agent ? { httpsAgent: agent } : {}),
  });

  let pingInterval;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;

  const messageSequence = ["40", (sid) => `42["join_channel",{"channelId":"${CHANNEL_ID}","context":"dapp_connectToChannel","clientType":"dapp"}]`];

  let currentMessageIndex = 0;

  ws.on("open", () => {
    console.log(`[Acc ${index}][${address}][${proxyIP}] ✓ Connected to MetaMask WebSocket for bandwidth sharing`.green);
    reconnectAttempts = 0;

    if (messageSequence.length > 0 && typeof messageSequence[0] === "string") {
      ws.send(messageSequence[0]);
      console.log(`[Acc ${index}][${address}][${proxyIP}] → Sent initial handshake message`.blue);
      currentMessageIndex++;
    }
  });

  ws.on("message", (data) => {
    const messageStr = data.toString();

    if (messageStr.startsWith("0{")) {
      console.log(`[Acc ${index}][${address}][${proxyIP}] ← Received connection setup message`.green);

      try {
        const setupData = JSON.parse(messageStr.substring(1));
        pingInterval = setupData.pingInterval;

        setInterval(() => {
          ws.send("2");
        }, pingInterval);

        console.log(`[Acc ${index}][${address}][${proxyIP}] ✓ Ping interval established (${pingInterval / 1000}s)`.green);
      } catch (e) {
        console.error(`[Acc ${index}][${address}][${proxyIP}] ! Error parsing setup data: ${e.message}`.red);
      }
    }

    if (messageStr.startsWith("40{") && messageStr.includes('"sid"')) {
      console.log(`[Acc ${index}][${address}][${proxyIP}] ← Received socket ID`.green);

      try {
        const sidMatch = messageStr.match(/"sid":"([^"]+)"/);
        if (sidMatch && sidMatch[1]) {
          const sid = sidMatch[1];

          if (currentMessageIndex < messageSequence.length && typeof messageSequence[currentMessageIndex] === "function") {
            const nextMessage = messageSequence[currentMessageIndex](sid);
            ws.send(nextMessage);
            console.log(`[Acc ${index}][${address}][${proxyIP}] → Sent join channel message`.green);
            currentMessageIndex++;
          }
        }
      } catch (e) {
        console.error(`[Acc ${index}][${address}][${proxyIP}] ! Error processing socket ID message: ${e.message}`.red);
      }
    }

    if (messageStr.includes('"ping"')) {
      const pingResponse = `42["ping",{"id":"${CHANNEL_ID}","clientType":"dapp","context":"on_channel_config","message":""}]`;
      ws.send(pingResponse);
    }

    if (messageStr === "430[null,{}]") {
      console.log(`[Acc ${index}][${address}][${proxyIP}] ✓ Successfully joined channel`.green);
    }
  });

  ws.on("error", (error) => {
    console.error(`[Acc ${index}][${address}][${proxyIP}] ! WebSocket error: ${error.message}`.red);
  });

  ws.on("close", () => {
    console.log(`[Acc ${index}][${address}][${proxyIP}] ! WebSocket connection closed`.yellow);
    reconnectAttempts++;
    if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(30000, Math.pow(2, reconnectAttempts) * 1000);
      console.log(`[Acc ${index}][${address}][${proxyIP}] ⟳ Attempting to reconnect in ${delay / 1000}s... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`.yellow);

      setTimeout(async () => {
        console.log(`[Acc ${index}][${address}][${proxyIP}] ⟳ Reconnecting now...`.blue);
        currentMessageIndex = 0;
        await connectMetaMaskWebSocket(address, proxy, proxyIP, index);
      }, delay);
    } else {
      console.log(`[Acc ${index}][${address}][${proxyIP}] ! Max reconnection attempts reached. Stopping reconnection attempts.`.yellow);
    }
  });

  return ws;
}

async function retryableApiCall(apiCallFn, ...args) {
  const maxRetries = 3;
  let retries = 0;
  const { index, address, proxyIP } = args;
  while (retries < maxRetries) {
    try {
      return await apiCallFn(...args);
    } catch (error) {
      retries++;

      if (retries >= maxRetries) {
        throw error;
      }

      const delay = 2000 * Math.pow(2, retries - 1);
      console.log(`[${getFormattedDateTime()}][Acc ${index}][${address}][${proxyIP}] API call failed. Retrying in ${delay / 1000}s... (Attempt ${retries}/${maxRetries})`.yellow);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function checkProxyIP(proxy) {
  try {
    if (!proxy) return null;
    const proxyAgent = new HttpsProxyAgent(proxy);
    const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: proxyAgent });
    if (response.status === 200) {
      return response.data.ip;
    } else {
      console.error(`Cannot check proxy IP. Status code: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(`Cannot check proxy IP ${error.message}`);
    return null;
  }
}

async function main() {
  console.log(colors.yellow("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)"));
  console.log(colors.yellow("Ping mỗi 30s | Điểm cập nhật mỗi 5 phút"));

  await sleep(2);

  const privateKeys = loadData("privateKeys.txt");
  const proxies = loadData("proxy.txt");
  let wss = [];

  const tasks = privateKeys.map((val, index) => async () => {
    const timeSleep = getRandomNumber(config.delay_start_bot[0], config.delay_start_bot[1]);
    console.log(`[Acc ${index + 1}] Delay ${timeSleep}s before start...`.blue);

    await sleep(timeSleep);

    const prvk = val.startsWith("0x") ? val : `0x${val}`;
    const wallet = new ethers.Wallet(prvk);
    let proxy = proxies[index];
    let proxyIP = await checkProxyIP(proxy);
    if (!proxyIP) {
      proxyIP = "Local IP";
      proxy = null;
    }
    const result = await getPointsFromWalletInfo(wallet.address, proxy, proxyIP, index + 1);

    if (config.auto_task && result.success) {
      const walletID = result.data["_id"];
      if (walletID) {
        await retryableApiCall(handleTask, wallet.address, walletID, proxy, proxyIP, index + 1);
      }
    }

    const ws = await connectMetaMaskWebSocket(wallet.address, proxy, proxyIP, index + 1);
    wss.push(ws);

    const intervalId = setInterval(async () => {
      try {
        const resInfo = await retryableApiCall(getPointsFromWalletInfo, wallet.address, proxy, proxyIP, index + 1);
        if (resInfo.success) {
          const walletID = resInfo.data["_id"];
          if (walletID) {
            await retryableApiCall(updateUpTime, wallet.address, walletID, proxy, proxyIP, index + 1);
          }
        }
      } catch (error) {
        console.error(`[${getFormattedDateTime()}] Error fetching points: ${error.message}`);
      }
    }, 300000); // 5 phút

    ws.on("close", () => clearInterval(intervalId));
  });

  await Promise.all(tasks.map((task) => task()));

  process.on("SIGINT", () => {
    console.log(`[${getFormattedDateTime()}] Shutting down bot...Tool developed by the team of tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)`.yellow);
    wss.forEach((ws) => ws?.close());
    process.exit(0);
  });
}

// Gọi hàm main
main().catch((err) => {
  console.error(`[${getFormattedDateTime()}] ! Unhandled error in main execution: ${err.message}`);
});
