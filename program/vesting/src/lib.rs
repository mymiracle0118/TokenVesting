use anchor_lang::{prelude::*,AnchorSerialize,AnchorDeserialize};
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod vesting {
    use super::*;

    pub fn create_vesting(
        ctx : Context<CreateVesting>,
        _bump : u8,
        _seed : String,
        _schedule : Vec<Schedule>
        ) -> ProgramResult {
        let pool = &mut ctx.accounts.pool;
        let mut total : u64 = 0;
        for s in _schedule.iter() {
            total += s.amount;
        }
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info().clone(),
            Transfer{
                from : ctx.accounts.source_account.to_account_info().clone(),
                to : ctx.accounts.token_account.to_account_info().clone(),
                authority : ctx.accounts.owner.to_account_info().clone()
            }
        );
        token::transfer(cpi_ctx, total)?;
        pool.token_mint = ctx.accounts.token_mint.key();
        pool.token_account = ctx.accounts.token_account.key();
        pool.dest_account = ctx.accounts.dest_account.key();
        pool.seed = _seed;
        pool.schedule = _schedule;
        pool.bump = _bump;
        Ok(())
    }

    pub fn unlock(
        ctx : Context<Unlock>,
        ) ->ProgramResult {
        let pool = &mut ctx.accounts.pool;
        let clock = (Clock::from_account_info(&ctx.accounts.clock)?).unix_timestamp as u64;
        let mut total : u64 =0;
        for s in pool.schedule.iter_mut() {
            if clock > s.release_time {
                total += s.amount;
                s.amount = 0;
            }
        }
        let pool_signer_seeds = &[(&pool.seed).as_bytes(),&[pool.bump]];
        let signer = &[&pool_signer_seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info().clone(),
            Transfer{
                from : ctx.accounts.token_account.to_account_info().clone(),
                to : ctx.accounts.dest_account.to_account_info().clone(),
                authority : pool.to_account_info().clone(),
            },
            signer
        );
        token::transfer(cpi_ctx, total)?;
        Ok(())
    }

    pub fn change_dest(
        ctx : Context<ChangeDest>,
        _new_dest : Pubkey,
        ) -> ProgramResult {
        let pool = &mut ctx.accounts.pool;
        pool.dest_account = _new_dest;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ChangeDest<'info>{
    #[account(mut)]
    owner : Signer<'info>,

    #[account(mut)]
    pool : ProgramAccount<'info, Pool>,

    #[account(owner=spl_token::id(), address=pool.dest_account, constraint=dest_account.owner==owner.key())]
    dest_account : Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct Unlock<'info>{
    #[account(mut)]
    pool : ProgramAccount<'info, Pool>,

    #[account(mut,owner=spl_token::id(), constraint=token_account.owner==pool.key())]
    token_account : Account<'info, TokenAccount>,

    #[account(mut,owner=spl_token::id(), address=pool.dest_account)]
    dest_account : Account<'info, TokenAccount>,

    token_program : Program<'info, Token>,

    clock : AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(_bump : u8, _seed : String)]
pub struct CreateVesting<'info>{
    #[account(mut)]
    owner : Signer<'info>,

    #[account(init, seeds=[(&_seed).as_bytes()], bump=_bump, payer=owner, space=8+POOL_SIZE)]
    pool : ProgramAccount<'info, Pool>,

    #[account(owner=spl_token::id())]
    token_mint : Account<'info, Mint>,

    #[account(mut, owner=spl_token::id(), constraint=source_account.owner==owner.key())]
    source_account : Account<'info, TokenAccount>,

    #[account(mut, owner=spl_token::id(), constraint=token_account.owner==pool.key())]
    token_account : Account<'info, TokenAccount>,

    #[account(owner=spl_token::id())]
    dest_account : Account<'info, TokenAccount>,

    token_program : Program<'info, Token>,

    system_program : Program<'info, System>
}

pub const POOL_SIZE : usize = 32 + 32 + 32 + 4 + 32 + 4 + 16 * 50 + 1;

#[account]
pub struct Pool {
    pub token_mint : Pubkey,
    pub token_account : Pubkey,
    pub dest_account : Pubkey,
    pub seed : String,
    pub schedule : Vec<Schedule>,
    pub bump : u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy)]
pub struct Schedule{
    pub release_time : u64,
    pub amount : u64,
}

#[error]
pub enum PoolError {
    #[msg("Invalid token amount")]
    InvalidTokenAmount,
}