import express, { Request, Response } from 'express';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import {TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID} from "@solana/spl-token"
import { Program, AnchorProvider, Wallet, web3, BN } from '@coral-xyz/anchor';
import {AiAgent } from './idl/ai_agent';
import * as fs from "fs";
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY || '';

const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(WALLET_PRIVATE_KEY)));
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
const provider = new AnchorProvider(connection, new Wallet(wallet), {});
const programId = new PublicKey(process.env.PROGRAM_ID as any);
const idlPath = "./idl/ai_agent.json";
const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
const program = new Program<AiAgent>(idl, programId, provider);

const curveSeed = "CurveConfiguration"
const POOL_SEED_PREFIX = "liquidity_pool"
const LIQUIDITY_SEED = "LiqudityProvider"
const SOL_VAULT_PREFIX = "liquidity_sol_vault"
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize route
app.post('/initialize', async (req: Request, res: Response) => {
  try {

    const [curveConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from(curveSeed)],
      program.programId
    )

    await program.methods
      .initialize(0.01)
      .accounts({
        dexConfigurationAccount: curveConfig,
        admin: wallet.publicKey,
        rent: web3.SYSVAR_RENT_PUBKEY,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    res.status(200).send({ message: 'Initialization successful' });
  } catch (error:any) {
    res.status(500).send({ error: error.message });
  }
});

// Create pool route
app.post('/create-pool', async (req: Request, res: Response) => {
  try {
    const { pool, tokenMint, poolTokenAccount, payer } = req.body;

    await program.methods
      .createPool()
      .accounts({
        pool: new PublicKey(pool),
        tokenMint: new PublicKey(tokenMint),
        poolTokenAccount: new PublicKey(poolTokenAccount),
        payer: new PublicKey(payer),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
        rent: web3.SYSVAR_RENT_PUBKEY,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    res.status(200).send({ message: 'Pool created successfully' });
  } catch (error:any) {
    res.status(500).send({ error: error.message });
  }
});

// Add liquidity route
app.post('/add-liquidity', async (req: Request, res: Response) => {
  try {
    const { pool, tokenMint, poolTokenAccount, userTokenAccount, poolSolVault, user } = req.body;

    await program.methods
      .addLiquidity()
      .accounts({
        pool: new PublicKey(pool),
        tokenMint: new PublicKey(tokenMint),
        poolTokenAccount: new PublicKey(poolTokenAccount),
        userTokenAccount: new PublicKey(userTokenAccount),
        poolSolVault: new PublicKey(poolSolVault),
        user: new PublicKey(user),
        rent: web3.SYSVAR_RENT_PUBKEY,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
      })
      .rpc();

    res.status(200).send({ message: 'Liquidity added successfully' });
  } catch (error:any) {
    res.status(500).send({ error: error.message });
  }
});

// Remove liquidity route
app.post('/remove-liquidity', async (req: Request, res: Response) => {
  try {
    const { pool, tokenMint, poolTokenAccount, userTokenAccount, poolSolVault, user, bump } = req.body;

    await program.methods
      .removeLiquidity(bump)
      .accounts({
        pool: new PublicKey(pool),
        tokenMint: new PublicKey(tokenMint),
        poolTokenAccount: new PublicKey(poolTokenAccount),
        userTokenAccount: new PublicKey(userTokenAccount),
        poolSolVault: new PublicKey(poolSolVault),
        user: new PublicKey(user),
        rent: web3.SYSVAR_RENT_PUBKEY,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
      })
      .rpc();

    res.status(200).send({ message: 'Liquidity removed successfully' });
  } catch (error:any) {
    res.status(500).send({ error: error.message });
  }
});

// Buy route
app.post('/buy', async (req: Request, res: Response) => {
  try {
    const { dexConfigurationAccount, pool, tokenMint, poolTokenAccount, poolSolVault, userTokenAccount, user, amount } = req.body;

    await program.methods
      .buy(new BN(amount))
      .accounts({
        dexConfigurationAccount: new PublicKey(dexConfigurationAccount),
        pool: new PublicKey(pool),
        tokenMint: new PublicKey(tokenMint),
        poolTokenAccount: new PublicKey(poolTokenAccount),
        poolSolVault: new PublicKey(poolSolVault),
        userTokenAccount: new PublicKey(userTokenAccount),
        user: new PublicKey(user),
        rent: web3.SYSVAR_RENT_PUBKEY,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
      })
      .rpc();

    res.status(200).send({ message: 'Buy transaction successful' });
  } catch (error:any) {
    res.status(500).send({ error: error.message });
  }
});

// Sell route
app.post('/sell', async (req: Request, res: Response) => {
  try {
    const { dexConfigurationAccount, pool, tokenMint, poolTokenAccount, poolSolVault, userTokenAccount, user, amount, bump } = req.body;

    await program.methods
      .sell(new BN(amount), bump)
      .accounts({
        dexConfigurationAccount: new PublicKey(dexConfigurationAccount),
        pool: new PublicKey(pool),
        tokenMint: new PublicKey(tokenMint),
        poolTokenAccount: new PublicKey(poolTokenAccount),
        poolSolVault: new PublicKey(poolSolVault),
        userTokenAccount: new PublicKey(userTokenAccount),
        user: new PublicKey(user),
        rent: web3.SYSVAR_RENT_PUBKEY,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
      })
      .rpc();

    res.status(200).send({ message: 'Sell transaction successful' });
  } catch (error:any) {
    res.status(500).send({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

