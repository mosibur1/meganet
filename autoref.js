const { ethers } = require("ethers");
const axios = require("axios");
const fs = require("fs");
const readline = require("readline");
const { SocksProxyAgent } = require("socks-proxy-agent");
const { HttpsProxyAgent } = require("https-proxy-agent");

const chalk = require("chalk");
const { config } = require("./config");
const { loadData } = require("./utils");

const privateKeys = loadData("privateKeys.txt");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function generateWallet() {
  const wallet = ethers.Wallet.createRandom();
  return wallet;
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

async function newAgent(proxy) {
  if (!proxy) return null;
  try {
    let agent = null;
    if (proxy.startsWith("http://")) {
      agent = new HttpsProxyAgent(proxy);
    } else if (proxy.startsWith("sock")) agent = new SocksProxyAgent(proxy);
    else {
      console.error(chalk.red(`Invalid proxy format: ${proxy}`));
      return null;
    }
    return agent;
  } catch (error) {
    console.error(chalk.red(`Proxy ${proxy} failed: ${error.message}`));
    return null;
  }
}

function getHeaders() {
  return {
    Host: "api.meganet.app",
    Connection: "keep-alive",
    "sec-ch-ua-platform": '"Windows"',
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    Accept: "*/*",
    Origin: "https://meganet.app",
    "Sec-Fetch-Site": "same-site",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    Referer: "https://meganet.app/",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-US,en;q=0.9",
  };
}
function saveSuccessWallet(address, privateKey) {
  const data = `\nAddress: ${address}\nPrivate Key: ${privateKey}\n
  ==============\n`;
  fs.appendFileSync("accsuccess.txt", data, "utf8");

  const isFound = privateKeys.findIndex((f) => f.replace("0x", "") === privateKey.replace("0x", ""));
  if (isFound < 0) fs.appendFileSync("privateKeys.txt", `\n${privateKey}`, "utf8");
}

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(chalk.blue(question), (answer) => {
      resolve(answer);
    });
  });
}

async function processWallet(wallet, proxy, index) {
  const address = wallet.address;
  const proxyIP = await checkProxyIP(proxy);
  const agent = proxyIP ? await newAgent(proxy) : null;
  try {
    const url = `https://api.meganet.app/wallets?address=${address}&refcode=${config.ref_code}`;
    const response = await axios.get(url, {
      headers: getHeaders(),
      ...(agent ? { httpsAgent: agent } : {}),
    });
    console.log(chalk.green(`[Account ${index}][${proxyIP ? [proxyIP] : "without proxy"}]: ${address} - register Success `));
    return true;
  } catch (error) {
    console.error(chalk.red(`[Account ${index}][${proxyIP ? [proxyIP] : "without proxy"}]: ${address} - register Failed: ${error.message}`));
    return false;
  }
}

async function main() {
  if (!config.ref_code) return console.log(`Miss ref code`.red);
  const proxy = loadData("proxy.txt");
  const isNew = await askQuestion("User your wallet or create new wallet? Enter number (1.Your wallet | 2.Create new wallet): ");
  let numAccounts = 0;
  if (parseInt(isNew) != 1) {
    const num = await askQuestion("Enter number of accounts to create: ");
    numAccounts = parseInt(num);
    for (let i = 0; i < numAccounts; i++) {
      try {
        const wallet = await generateWallet();
        const address = wallet.address;
        const privateKey = wallet.privateKey;
        const res = await processWallet(wallet, proxy[i], i + 1);
        if (res) saveSuccessWallet(address, privateKey);
        else {
          const data = `\nAddress: ${address}\nPrivate Key: ${privateKey}\n==============\n`;
          fs.appendFileSync("accErr.txt", data, "utf8");
        }
      } catch (error) {
        console.error(chalk.red(`Failed to create wallet: ${error.message}`));
        continue; //
      }
    }
  } else {
    const privateKeysReff = loadData("privateKeysReff.txt");
    for (let i = 0; i < privateKeysReff.length; i++) {
      try {
        const prvk = privateKeysReff[i].startsWith("0x") ? privateKeysReff[i] : `0x${privateKeysReff[i]}`;
        const wallet = new ethers.Wallet(prvk);
        const res = await processWallet(wallet, proxy[i], i + 1);
        if (res) saveSuccessWallet(wallet.address, prvk);
        else {
          const data = `\nAddress: ${wallet.address}\nPrivate Key: ${prvk}\n==============\n`;
          fs.appendFileSync("accErr.txt", data, "utf8");
        }
      } catch (error) {
        console.error(chalk.red(`Failed to create wallet from private key: ${error.message}`));
        continue; //
      }
    }
  }
}

main();
