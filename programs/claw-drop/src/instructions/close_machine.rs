use anchor_lang::prelude::*;

use crate::CloseMachine;

/// One-way migration helper: close the machine account (rent back to the authority) so
/// `init_machine` can recreate it at a new size. The vault is a separate system-owned PDA, so
/// its balance is untouched, and the machine PDA keeps the same address (seeded by the
/// authority), so the Core collection it is the update authority of stays valid.
///
/// The account is taken unchecked because after a layout change it no longer deserialises.
/// Authorisation is the PDA derivation itself: the seeds include the signing authority.
pub fn handler(ctx: Context<CloseMachine>) -> Result<()> {
    let machine = ctx.accounts.machine.to_account_info();
    let authority = ctx.accounts.authority.to_account_info();

    let refund = machine.lamports();
    **machine.try_borrow_mut_lamports()? = 0;
    **authority.try_borrow_mut_lamports()? = authority
        .lamports()
        .checked_add(refund)
        .ok_or(crate::errors::ClawError::MathOverflow)?;
    machine.assign(&anchor_lang::system_program::ID);
    machine.resize(0)?;
    Ok(())
}
