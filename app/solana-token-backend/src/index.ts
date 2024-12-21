import express, { Request, Response } from 'express';
import { Connection, PublicKey, Keypair, sendAndConfirmTransaction, Transaction, SYSVAR_RENT_PUBKEY, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';
import {TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, mintTo, createMint, getAssociatedTokenAddress} from "@solana/spl-token"
import { Program, AnchorProvider, Wallet, web3, BN } from '@coral-xyz/anchor';
import {AiAgent, idljson } from './idl/ai_agent';
import * as fs from "fs";
import * as dotenv from 'dotenv';
import { ASSOCIATED_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/utils/token';

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
const IDL = JSON.parse(idljson);
const program = new Program<AiAgent>(IDL, programId, provider);

const curveSeed = "CurveConfiguration"
const POOL_SEED_PREFIX = "liquidity_pool"
const SOL_VAULT_PREFIX = "liquidity_sol_vault"
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const [curveConfig] = PublicKey.findProgramAddressSync(
  [Buffer.from(curveSeed)],
  program.programId
)

const teamAccount = new PublicKey("6XF158v9uXWL7dpJnkJFHKpZgzmLXX5HoH4vG5hPsmmP")

// Initialize route
// app.post('/initialize', async (req: Request, res: Response) => {
//   try {
//     const tx = new Transaction()
//     .add(
//       await program.methods
//         .initialize(1)
//         .accounts({
//           dexConfigurationAccount: curveConfig,
//           admin: wallet.publicKey,
//           rent: SYSVAR_RENT_PUBKEY,
//           systemProgram: SystemProgram.programId
//         })
//         .instruction()
//     )
//     tx.feePayer = wallet.publicKey
//     tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
//     console.log(await connection.simulateTransaction(tx))
//     const sig = await sendAndConfirmTransaction(connection, tx, [wallet], { skipPreflight: true })
//     console.log("Successfully initialized : ", `https://solscan.io/tx/${sig}?cluster=devnet`)
//     let pool = await program.account.curveConfiguration.fetch(curveConfig)
//     console.log("Pool State : ", pool)

//     res.status(200).send({ message: 'Initialization successful' });
//   } catch (error:any) {
//     res.status(500).send({ error: error.message });
//   }
// });

// Create pool route
app.get("/create-token-and-add-liquidity", async (req, res) => {
  try {
    const {user_key} = req.body
    // Step 1: Create a new SPL Token
    console.log("Creating a new token...");
    const user = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(user_key)));
    const mint = await createMint(connection, user, user.publicKey, null, 9); // 9 decimals
    console.log(mint.toBase58())

    const amount = new BN(1000000000).mul(new BN(10 ** 9))

    // Step 2: Get or create the user's associated token account
    console.log("Getting user's associated token account...");
    const userTokenAccount = await getOrCreateAssociatedTokenAccount(connection, user, mint, user.publicKey)

    console.log("Minting tokens to the user...");
    await mintTo(connection, user, mint, userTokenAccount.address, user, BigInt(amount.toString()));

    // Step 4: Create the pool PDA
    console.log("Creating the pool PDA...");
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(POOL_SEED_PREFIX), mint.toBuffer()],
      program.programId
    );

    const [poolSolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from(SOL_VAULT_PREFIX), mint.toBuffer()],
      program.programId
    );

    const poolTokenAccount = await getAssociatedTokenAddress(
      mint, poolPda, true
    )

    const tx1 = new Transaction()
    .add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }),
      await program.methods
        .createPool()
        .accounts({
          pool: poolPda,
          tokenMint: mint,
          poolTokenAccount: poolTokenAccount,
          payer: user.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId
        })
        .instruction()
    )
    console.log(user.publicKey.toBase58())
    tx1.feePayer = user.publicKey
    tx1.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
    console.log(await connection.simulateTransaction(tx1))
    const sig = await sendAndConfirmTransaction(connection, tx1, [user], { skipPreflight: true })
    console.log("Successfully created pool : ", `https://solscan.io/tx/${sig}?cluster=devnet`)

    // Step 5: Add Liquidity
    console.log("Adding liquidity to the pool...");
    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }),
      await program.methods
        .addLiquidity()
        .accounts({
          pool: poolPda,
          poolSolVault: poolSolVault,
          tokenMint: mint,
          poolTokenAccount: poolTokenAccount,
          userTokenAccount: userTokenAccount.address,
          user: user.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );

    tx.feePayer = user.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const signature = await sendAndConfirmTransaction(connection, tx, [user], { skipPreflight: true });

    console.log(`Transaction successful: https://solscan.io/tx/${signature}?cluster=devnet`);

    res.json({
      success: true,
      message: "Token created, minted to user, pool created, and liquidity added successfully.",
      tokenMintAddress: mint.toBase58(),
      transactionSignature: signature,
    });
  } catch (error:any) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// Remove liquidity route
// app.post('/remove-liquidity', async (req: Request, res: Response) => {
//   try {
//     const { pool, tokenMint, poolTokenAccount, userTokenAccount, poolSolVault, user, bump } = req.body;

//     await program.methods
//       .removeLiquidity(bump)
//       .accounts({
//         pool: new PublicKey(pool),
//         tokenMint: new PublicKey(tokenMint),
//         poolTokenAccount: new PublicKey(poolTokenAccount),
//         userTokenAccount: new PublicKey(userTokenAccount),
//         poolSolVault: new PublicKey(poolSolVault),
//         user: new PublicKey(user),
//         rent: web3.SYSVAR_RENT_PUBKEY,
//         systemProgram: web3.SystemProgram.programId,
//         tokenProgram: TOKEN_PROGRAM_ID,
//         associatedTokenProgram: new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID),
//       })
//       .rpc();

//     res.status(200).send({ message: 'Liquidity removed successfully' });
//   } catch (error:any) {
//     res.status(500).send({ error: error.message });
//   }
// });

// Buy route
app.post('/buy', async (req: Request, res: Response) => {
    try {
    
    const { tokenMint, user_key, amountInSol } = req.body;
    const user = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(user_key)));
    console.log(tokenMint)
    const mint = new PublicKey(tokenMint)
    console.log("here")
    const userTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      user,
      mint,
      user.publicKey
    );
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(POOL_SEED_PREFIX), mint.toBuffer()],
      program.programId
    );

    const [poolSolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from(SOL_VAULT_PREFIX), mint.toBuffer()],
      program.programId
    );

    const poolTokenAccount = await getAssociatedTokenAddress(
      mint, poolPda, true
    )
    console.log("here1")
    const amount = Math.floor(amountInSol * 1_000_000_000);
    console.log(amount)
    const tx = new Transaction()
        .add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }),
          await program.methods
            .buy(new BN(amount.toString()))
            .accounts({
              pool: poolPda,
              tokenMint: mint,
              teamAccount: teamAccount,
              poolSolVault,
              poolTokenAccount: poolTokenAccount,
              userTokenAccount: userTokenAccount.address,
              dexConfigurationAccount: curveConfig,
              user: user.publicKey,
              tokenProgram: TOKEN_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
              rent: SYSVAR_RENT_PUBKEY,
              systemProgram: SystemProgram.programId
            })
            .instruction()
        )

      console.log("here2")
      tx.feePayer = user.publicKey
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      console.log(await connection.simulateTransaction(tx))
      const sig = await sendAndConfirmTransaction(connection, tx, [user], { skipPreflight: true })
      console.log("Successfully bought : ", `https://solscan.io/tx/${sig}?cluster=devnet`)

    res.status(200).send({ message: 'Buy transaction successful' });
  } catch (error:any) {
    res.status(500).send({ error: error.message });
  }
});

// Sell route
app.post('/sell', async (req: Request, res: Response) => {

  try {
    const { tokenMint, user_key, tokenAmount } = req.body;
    const user = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(user_key)));
    const mint = new PublicKey(tokenMint)
    const userTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      user,
      mint,
      user.publicKey
    );
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(POOL_SEED_PREFIX), mint.toBuffer()],
      program.programId
    );

    const [poolSolVault, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(SOL_VAULT_PREFIX), mint.toBuffer()],
      program.programId
    );

    const poolTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      user,
      mint,
      poolPda,
      true
    );
    const amount = new BN(tokenAmount.toString()).mul(new BN(10 ** 9))
    console.log(amount)
    const tx = new Transaction()
    .add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }),
      await program.methods
        .sell(new BN(amount), bump)
        .accounts({
          pool: poolPda,
          tokenMint: mint,
          teamAccount: teamAccount,
          poolSolVault,
          poolTokenAccount: poolTokenAccount.address,
          userTokenAccount: userTokenAccount.address,
          dexConfigurationAccount: curveConfig,
          user: user.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId
        })
        .instruction()
    )
  tx.feePayer = user.publicKey
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
  console.log(await connection.simulateTransaction(tx))
  const sig = await sendAndConfirmTransaction(connection, tx, [user], { skipPreflight: true })
  console.log("Successfully Sold : ", `https://solscan.io/tx/${sig}?cluster=devnet`)

    res.status(200).send({ message: 'Sell transaction successful' });
  } catch (error:any) {
    res.status(500).send({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

