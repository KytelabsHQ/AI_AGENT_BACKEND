import express, { Request, Response } from 'express';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, web3, BN } from '@coral-xyz/anchor';
import {AiAgent, idljson } from './idl/ai_agent';
import * as dotenv from 'dotenv';
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());



type CandlestickData = {
  time: number; // Timestamp
  open: number; // Opening price
  high: number; // Highest price
  low: number;  // Lowest price
  close: number; // Closing price
};

const tokenDataMap = new Map<
  string,
  { history: CandlestickData[]; lastFetchedTimestamp: number }
>();

const PORT = 3002;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY || '';

const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(WALLET_PRIVATE_KEY)));
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
const provider = new AnchorProvider(connection, new Wallet(wallet), {});
const programId = new PublicKey(process.env.PROGRAM_ID as any);
const IDL = JSON.parse(idljson);
const program = new Program<AiAgent>(IDL, programId, provider);

const curveSeed = "CurveConfiguration"
const POOL_SEED_PREFIX = "liquidity_pool"
const SOL_VAULT_PREFIX = "liquidity_sol_vault"
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}





const fetchPoolData = async (tokenMint:string)=>{
  const mint = new PublicKey(tokenMint)
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_SEED_PREFIX), mint.toBuffer()],
    program.programId
  );
  console.log("here")
  const stateData = await program.account.liquidityPool.fetch(poolPda);
  const reserveSol = stateData.reserveSol
  const reserveToken = stateData.reserveToken
  const total_supply = stateData.totalSupply

  const tokenDecimals = 9;
  const reserveTokenScaledBN = reserveToken.div(new BN(Math.pow(10, tokenDecimals)));

  const price = (parseInt(reserveSol.toString()))/(parseInt(reserveTokenScaledBN.toString())) // Divide reserveSol by scaled reserveToken

  console.log('priceBN:', price);



  return { reserveSol: parseInt(reserveSol.toString()), reserveToken: parseInt(reserveTokenScaledBN.toString()), price:price}
}

async function generateCandlestickData(tokenMint:string) {
  
  const currentTimestamp = Math.floor(Date.now() / 1000);

  if (!tokenDataMap.has(tokenMint)) {
    tokenDataMap.set(tokenMint, {
      history: [],
      lastFetchedTimestamp: currentTimestamp - 60, // Align to nearest min
    });
  }

  const tokenData = tokenDataMap.get(tokenMint)!;
  const { history } = tokenData;
  let { lastFetchedTimestamp } = tokenData;

  const interval = 30; // 30 sec interval

  console.log(`Processing token: ${tokenMint}`);
  console.log(`currentTimestamp: ${currentTimestamp}`);
  console.log(`lastFetchedTimestamp: ${lastFetchedTimestamp}`);
  console.log(`Condition: ${lastFetchedTimestamp + interval <= currentTimestamp}`);



  while (lastFetchedTimestamp + interval <= currentTimestamp) {
    const startTime = lastFetchedTimestamp;
    const endTime = startTime + interval;

    console.log(
      `Fetching data for interval: ${new Date(startTime * 1000).toISOString()} - ${new Date(
        endTime * 1000
      ).toISOString()}`
    );

    const prices: number[] = [];
    for (let t = startTime; t < endTime; t += 3) {
      try {
        const poolData = await fetchPoolData(tokenMint);
        console.log(poolData)
        prices.push(poolData.price); // Collect prices every minute
      } catch (error) {
        console.error(`Error fetching pool data: ${error}`);
        break;
      }
    }

    console.log(`Prices collected for interval:`, prices);

    if (prices.length > 0) {
      const open = prices[0];
      const high = Math.max(...prices);
      const low = Math.min(...prices);
      const close = prices[prices.length - 1];

      history.push({
        time: startTime,
        open,
        high,
        low,
        close,
      });
    } else {
      console.warn(`No prices found for interval ${startTime} - ${endTime}`);
    }

    lastFetchedTimestamp += interval;
  }

  tokenDataMap.set(tokenMint, { history, lastFetchedTimestamp });

  // console.log(`Updated history for ${tokenMint}:`, history);
  return history;
}






app.get('/candlestickdata/:tokenmint', async (req: Request, res: Response) => {
  try {
  
  const { tokenmint } = req.params;
  const data = await generateCandlestickData(tokenmint)
  res.status(200).json({data});
} catch (error:any) {
  res.status(500).send({ error: error.message });
}
});

app.get('/poolData/:tokenmint', async (req:Request, res:Response) => {
  try {
    const { tokenmint } = req.params;
    const data = await fetchPoolData(tokenmint)
    res.status(200).json(data)
  } catch (error:any) {
    res.status(500).send({ error: error.message });
  }
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
