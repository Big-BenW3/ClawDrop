use anchor_lang::prelude::*;
use mpl_core::types::Key as CoreKey;

use crate::errors::ClawError;
use crate::state::*;
use crate::SetCollection;

/// Point a freshly re-initialised machine at an existing Core collection (migration only).
/// The collection must already be owned by Core and name this machine as its update authority,
/// so it can never be pointed at someone else's collection.
pub fn handler(ctx: Context<SetCollection>) -> Result<()> {
    require!(ctx.accounts.machine.collection == Pubkey::default(), ClawError::CollectionExists);

    let info = ctx.accounts.collection.to_account_info();
    require!(*info.owner == MPL_CORE_ID, ClawError::InvalidAsset);
    let data = info.try_borrow_data()?;
    // Core collection layout: [key: u8 = CollectionV1][update_authority: 32 bytes]...
    // Read just those two fields: deserialising the whole account pulls in mpl-core's hooked
    // `Collection` decoder, whose stack frame exceeds the SBF limit.
    require!(data.len() >= 33 && data[0] == CoreKey::CollectionV1 as u8, ClawError::InvalidAsset);
    require!(data[1..33] == ctx.accounts.machine.key().to_bytes(), ClawError::InvalidAsset);
    drop(data);

    ctx.accounts.machine.collection = ctx.accounts.collection.key();
    Ok(())
}
