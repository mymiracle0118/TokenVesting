import { Fragment, useRef, useState, useEffect } from 'react';
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {Connection,Keypair,PublicKey,Transaction,TransactionInstruction,ConfirmOptions,SYSVAR_CLOCK_PUBKEY,SYSVAR_RENT_PUBKEY,SystemProgram,clusterApiUrl} from '@solana/web3.js'
import {AccountLayout,MintLayout,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,Token} from "@solana/spl-token";
import useNotify from './notify'
import * as anchor from "@project-serum/anchor";
import fs from 'fs'
import {Upload} from 'antd'

const { Dragger } = Upload
let wallet : any
let conn = new Connection(clusterApiUrl('devnet'))
let notify: any

const programId = new PublicKey('Acyg2UPTF8zJ9Xob99u4kbDfaTb7dgrsrPJzV5pNpcup')
const idl = require('./vesting.json')
const confirmOption : ConfirmOptions = {commitment : 'finalized',preflightCommitment : 'finalized',skipPreflight : false}

export default function Vesting(){
	wallet = useWallet()
	notify = useNotify()

	const [vestingToken, setVestingToken] = useState("5Pdw82Xqs6kzSZf2p472LbKb4FqegtQkgoaXCnE4URfa")
	const [seed, setSeed] = useState('')
	const [seed2, setSeed2] = useState('')
	const [destWallet, setDestWallet] = useState('GhJf8rGvCYA9A29C9UuMcrRBzhejEfrdPaHWw5yqRiRU')
	const [destTokenAccount, setDestTokenAccount] = useState('')
	const [schedule, setSchedule] = useState<any[]>([])


	const [poolData, setPoolData] = useState<any>(null)


	useEffect(()=>{changeWallet()},[destWallet])
	useEffect(()=>{getPoolData()},[seed2])
	const changeWallet = async()=>{
		try{
			let destWalletPubkey = new PublicKey(destWallet)
			let tokenMint = new PublicKey(vestingToken)
			setDestTokenAccount((await getTokenWallet(destWalletPubkey, tokenMint)).toBase58())
		}catch(err){
			setDestTokenAccount('')
		}
	}
	const createAssociatedTokenAccountInstruction = (
	  associatedTokenAddress: PublicKey,
	  payer: PublicKey,
	  walletAddress: PublicKey,
	  splTokenMintAddress: PublicKey
	    ) => {
	  const keys = [
	    { pubkey: payer, isSigner: true, isWritable: true },
	    { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
	    { pubkey: walletAddress, isSigner: false, isWritable: false },
	    { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
	    {
	      pubkey: SystemProgram.programId,
	      isSigner: false,
	      isWritable: false,
	    },
	    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
	    {
	      pubkey: SYSVAR_RENT_PUBKEY,
	      isSigner: false,
	      isWritable: false,
	    },
	  ];
	  return new TransactionInstruction({
	    keys,
	    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
	    data: Buffer.from([]),
	  });
	}
	const getTokenWallet = async (owner: PublicKey,mint: PublicKey) => {
	  return (
	    await PublicKey.findProgramAddress(
	      [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
	      ASSOCIATED_TOKEN_PROGRAM_ID
	    )
	  )[0];
	}
	async function getDecimalsOfToken(mint : PublicKey){
	  let resp = await conn.getAccountInfo(mint)
	  let accountData = MintLayout.decode(Buffer.from(resp!.data))
	  return accountData.decimals
	}
	const getPoolData = async() => {
		try{
			const randWallet = new anchor.Wallet(Keypair.generate())
    	const provider = new anchor.Provider(conn,randWallet,confirmOption)
    	const program = new anchor.Program(idl,programId,provider)
    	const [pool, bump] = await PublicKey.findProgramAddress([Buffer.from(seed2)],programId)
    	const pD = await program.account.pool.fetch(pool)
    	const decimals = await getDecimalsOfToken(pD.tokenMint)
    	setPoolData({...pD, decimals : Math.pow(10,decimals)})
		} catch(err){
			console.log(err)
			setPoolData(null)
		}
	}	

	const vesting = async() => {
		try{
			if(schedule.length==0) throw new Error("Invalid schedule")
			let provider = new anchor.Provider(conn, wallet as any, confirmOption)
	  	let program = new anchor.Program(idl,programId,provider)
	  	let transaction = new Transaction()
			const [pool, bump] = await PublicKey.findProgramAddress([Buffer.from(seed)],programId)
			const tokenMint = new PublicKey(vestingToken)
			const decimals = Math.pow(10, await getDecimalsOfToken(tokenMint))
			const tokenAccount = await getTokenWallet(pool,tokenMint)
			transaction.add(createAssociatedTokenAccountInstruction(tokenAccount,wallet.publicKey,pool,tokenMint))
			let newSchedule : any[] = []
			schedule.map((item)=>{
				let amount = item.amount * decimals
    		let releaseTime = (new Date(item.time)).getTime()/1000
    		if(amount>0) newSchedule.push({releaseTime : new anchor.BN(releaseTime), amount : new anchor.BN(amount.toString())})
			})
			transaction.add(program.instruction.createVesting(
				new anchor.BN(bump),
				seed,
				newSchedule,
				{
					accounts:{
						owner : wallet.publicKey,
						pool : pool,
						tokenMint : tokenMint,
						sourceAccount : await getTokenWallet(wallet.publicKey, tokenMint),
						tokenAccount : tokenAccount,
						destAccount : new PublicKey(destTokenAccount),
						tokenProgram : TOKEN_PROGRAM_ID,
						systemProgram : SystemProgram.programId,
					}
				}
			))
			await sendTransaction(transaction, [])
			notify('success', 'Success!')
		}catch(e){
			console.log(e)
			notify('error', 'Failed Instruction')
		}
	}

	const changeDestination = async() => {
		try{
			let provider = new anchor.Provider(conn, wallet as any, confirmOption)
	  	let program = new anchor.Program(idl,programId,provider)
	  	let transaction = new Transaction()
	  	const [pool, bump] = await PublicKey.findProgramAddress([Buffer.from(seed2)],programId)
	  	const dest = new PublicKey(destTokenAccount)
	  	if((await conn.getAccountInfo(dest))==null)
	  		transaction.add(createAssociatedTokenAccountInstruction(dest,wallet.publicKey,new PublicKey(destWallet),poolData.tokenMint))
	  	transaction.add(program.instruction.changeDest(dest,{
	  		accounts:{
	  			owner : wallet.publicKey,
	  			pool : pool,
	  			destAccount : poolData.destAccount
	  		}
	  	}))
			await sendTransaction(transaction, [])
			notify('success', 'Success!')
		}catch(e){
			console.log(e)
			notify('error', 'Failed Instruction')
		}
	}

	const unlock = async() => {
		try{
			let provider = new anchor.Provider(conn, wallet as any, confirmOption)
	  	let program = new anchor.Program(idl,programId,provider)
	  	let transaction = new Transaction()
	  	const [pool, bump] = await PublicKey.findProgramAddress([Buffer.from(seed2)],programId)
	  	transaction.add(program.instruction.unlock({
	  		accounts:{
	  			pool : pool,
	  			tokenAccount : await getTokenWallet(pool,poolData.tokenMint),
	  			destAccount : poolData.destAccount,
	  			tokenProgram : TOKEN_PROGRAM_ID,
	  			clock : SYSVAR_CLOCK_PUBKEY
	  		}
	  	}))
			await sendTransaction(transaction, [])
			notify('success', 'Success!')
		}catch(e){
			console.log(e)
			notify('error', 'Failed Instruction')
		}
	}

	async function sendTransaction(transaction : Transaction, signers : Keypair[]) {
		transaction.feePayer = wallet.publicKey
		transaction.recentBlockhash = (await conn.getRecentBlockhash('max')).blockhash;
		await transaction.setSigners(wallet.publicKey,...signers.map(s => s.publicKey));
		if(signers.length != 0) await transaction.partialSign(...signers)
		const signedTransaction = await wallet.signTransaction(transaction);
		let hash = await conn.sendRawTransaction(await signedTransaction.serialize());
		await conn.confirmTransaction(hash);
		return hash
	}

	return <div className="container-fluid mt-4 row">
		<div className="col-lg-6">
			<h4>Create Vesting</h4>
			<div className="input-group mb-3">
        <span className="input-group-text">Vesting Token</span>
        <input name="vestingToken"  type="text" className="form-control" onChange={(event)=>{setVestingToken(event.target.value)}} value={vestingToken}/>
      </div>
      <div className="input-group mb-3">
        <span className="input-group-text">Vesting Seed</span>
        <input name="seed"  type="text" className="form-control" onChange={(event)=>{setSeed(event.target.value)}} value={seed}/>
      </div>
      <div className="input-group mb-3">
        <span className="input-group-text">Destination Wallet</span>
        <input name="destWallet"  type="text" className="form-control" onChange={(event)=>{setDestWallet(event.target.value)}} value={destWallet}/>
      </div>
      <div className="input-group mb-3">
        <span className="input-group-text">Destination Token Acccount</span>
        <input name="destTokenAccount"  type="text" className="form-control" disabled={true} onChange={(event)=>{setDestTokenAccount(event.target.value)}} value={destTokenAccount}/>
      </div>
			<div className="card m-2">
      	<Dragger
          style={{ padding: 20 }}
          multiple={false}
          customRequest={info => {
            info?.onSuccess?.({}, null as any);
          }}
          onChange={async info => {
          	let reader = new FileReader()
          	if(info.file.originFileObj != null)
          	reader.readAsText(info.file.originFileObj)
          	reader.onload = function(){
          		let fileContent = JSON.parse(reader.result as any)
          		setSchedule(fileContent)
          	}
          	reader.onerror = function(){
          		setSchedule([])
          	}
          }}
        >
          <div className="ant-upload-drag-icon">
            <h5 style={{ fontWeight: 700 }}>
              Upload Vesting Schedule File
            </h5>
          </div>
        </Dragger>
      </div>	
			<div className="row container-fluid mb-3">
				<button type="button" disabled={!(wallet && wallet.connected)} className="btn btn-primary mb3" onClick={async ()=>{
					await vesting()
				}}>Vesting</button>
			</div>
			<table className="table">
				<thead><tr><th>Amount</th><th>When</th></tr></thead>
        <tbody>
          {
            schedule.map((item,idx) =>{
              return <tr key={idx}>
                <td>{item.amount}</td><td>{item.time}</td>
              </tr>
            })
          }
        </tbody>
      </table>
		</div>
		<div className="col-lg-6">
			<h4>Vesting Data</h4>
			<div className="input-group mb-3">
        <span className="input-group-text">Vesting Seed</span>
        <input name="seed2"  type="text" className="form-control" onChange={(event)=>{setSeed2(event.target.value)}} value={seed2}/>
      </div>
      <div className="row container-fluid mb-3">
				<button type="button" disabled={!(wallet && wallet.connected && poolData)} className="btn btn-primary mb3" onClick={async ()=>{
					await unlock()
					await getPoolData()
				}}>Unlock</button>
			</div>
			<div className="row container-fluid mb-3">
				<button type="button" disabled={!(wallet && wallet.connected && poolData)} className="btn btn-primary mb3" onClick={async ()=>{
					await changeDestination()
					await getPoolData()
				}}>Change Destination</button>
			</div>
      {
      	poolData != null &&
      	<>
      		<p>{"Token : "+poolData.tokenMint.toBase58()}</p>
		    	<p>{"Token Account : "+poolData.tokenAccount.toBase58()}</p>
		    	<p>{"Dest Account : "+poolData.destAccount.toBase58()}</p>
		    	<table className="table">
          <thead><tr><th>Amount</th><th>When</th></tr></thead>
            <tbody>
              {
                (poolData.schedule as any[]).map((item,idx) =>{
                  return <tr key={idx}>
                    <td>{item.amount ? item.amount/poolData.decimals : "unlocked"}</td><td>{(new Date(item.releaseTime.toNumber()*1000)).toDateString()}</td>
                  </tr>
                })
              }
            </tbody>
          </table>
      	</>
      }
		</div>
	</div>
}