use anchor_lang::prelude::*;
use mpl_core::instructions::CreateCollectionV2CpiBuilder;

use crate::errors::ClawError;
use crate::state::*;
use crate::CreateCollection;

/// Creates the Metaplex Core collection with the machine PDA as its update authority, so only
/// this program can mint into it. The collection keypair signs the outer transaction.
pub fn handler(ctx: Context<CreateCollection>, name: String, uri: String) -> Result<()> {
    require!(ctx.accounts.machine.collection == Pubkey::default(), ClawError::CollectionExists);
    require!(name.len() <= MAX_NAME_LEN, ClawError::NameTooLong);
    require!(uri.len() <= MAX_URI_PREFIX_LEN + 16, ClawError::UriTooLong);

    let core = ctx.accounts.mpl_core_program.to_account_info();
    let collection = ctx.accounts.collection.to_account_info();
    let machine = ctx.accounts.machine.to_account_info();
    let authority = ctx.accounts.authority.to_account_info();
    let system = ctx.accounts.system_program.to_account_info();
    CreateCollectionV2CpiBuilder::new(&core)
        .collection(&collection)
        .update_authority(Some(&machine))
        .payer(&authority)
        .system_program(&system)
        .name(name)
        .uri(uri)
        .invoke()?;

    ctx.accounts.machine.collection = ctx.accounts.collection.key();
    Ok(())
}
