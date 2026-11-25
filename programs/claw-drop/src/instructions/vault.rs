use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::state::VAULT_SEED;

/// Pay `lamports` out of the vault PDA (a system-owned account) to `to`.
pub fn pay_from_vault<'info>(
    system_program: &AccountInfo<'info>,
    vault: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    machine: &Pubkey,
    vault_bump: u8,
    lamports: u64,
) -> Result<()> {
    let seeds: &[&[u8]] = &[VAULT_SEED, machine.as_ref(), &[vault_bump]];
    transfer(
        CpiContext::new_with_signer(
            system_program.key(),
            Transfer { from: vault.clone(), to: to.clone() },
            &[seeds],
        ),
        lamports,
    )
}
