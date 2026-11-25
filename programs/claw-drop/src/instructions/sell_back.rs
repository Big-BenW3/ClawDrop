use anchor_lang::prelude::*;
use mpl_core::accounts::BaseAssetV1;
use mpl_core::instructions::BurnV1CpiBuilder;
use mpl_core::types::Key as CoreKey;

use super::vault::pay_from_vault;
use crate::errors::ClawError;
use crate::SellBack;

/// Burns a prize asset and pays its sell-back from the vault. The signer must be the asset's
/// current owner, so a prize that was transferred can be sold by its new holder.
pub fn handler(ctx: Context<SellBack>) -> Result<()> {
    require!(!ctx.accounts.prize.sold, ClawError::AlreadySold);

    let owner = {
        let data = ctx.accounts.asset.try_borrow_data()?;
        let base = BaseAssetV1::from_bytes(&data).map_err(|_| error!(ClawError::InvalidAsset))?;
        require!(base.key == CoreKey::AssetV1, ClawError::InvalidAsset);
        base.owner
    };
    require_keys_eq!(owner, ctx.accounts.owner.key(), ClawError::NotAssetOwner);

    // Effects before interactions: mark sold, burn, then pay.
    ctx.accounts.prize.sold = true;
    let payout = ctx.accounts.prize.sellback_lamports;

    let core = ctx.accounts.mpl_core_program.to_account_info();
    let asset = ctx.accounts.asset.to_account_info();
    let collection = ctx.accounts.collection.to_account_info();
    let signer = ctx.accounts.owner.to_account_info();
    let system = ctx.accounts.system_program.to_account_info();
    BurnV1CpiBuilder::new(&core)
        .asset(&asset)
        .collection(Some(&collection))
        .payer(&signer)
        .authority(Some(&signer))
        .system_program(Some(&system))
        .invoke()?;

    pay_from_vault(
        &system,
        &ctx.accounts.vault.to_account_info(),
        &signer,
        &ctx.accounts.machine.key(),
        ctx.accounts.machine.vault_bump,
        payout,
    )?;
    msg!("sold back for {} lamports", payout);
    Ok(())
}
