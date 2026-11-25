use anchor_lang::prelude::*;

use crate::errors::ClawError;
use crate::state::*;
use crate::InitMachine;

/// Creates the machine PDA. It starts paused with every slot disabled (radius 0) until the
/// setup script has configured all five slots and funded the vault.
pub fn handler(ctx: Context<InitMachine>, credit_price_lamports: u64, uri_prefix: String) -> Result<()> {
    require!(credit_price_lamports > 0, ClawError::InvalidSlotConfig);
    require!(uri_prefix.len() <= MAX_URI_PREFIX_LEN, ClawError::UriTooLong);

    let machine = &mut ctx.accounts.machine;
    machine.authority = ctx.accounts.authority.key();
    machine.credit_price_lamports = credit_price_lamports;
    machine.collection = Pubkey::default();
    machine.bump = ctx.bumps.machine;
    machine.vault_bump = ctx.bumps.vault;
    machine.paused = true;
    machine.slots = core::array::from_fn(|_| Slot::default());
    machine.uri_prefix = uri_prefix;
    Ok(())
}
