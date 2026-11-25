use anchor_lang::prelude::*;

use crate::errors::ClawError;
use crate::state::*;
use crate::AdminMachine;

/// Point NFT metadata at its real home once the app is deployed. Applies to future mints only.
pub fn handler(ctx: Context<AdminMachine>, uri_prefix: String) -> Result<()> {
    require!(uri_prefix.len() <= MAX_URI_PREFIX_LEN, ClawError::UriTooLong);
    ctx.accounts.machine.uri_prefix = uri_prefix;
    Ok(())
}
