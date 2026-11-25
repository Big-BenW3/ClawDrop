use anchor_lang::prelude::*;
use anchor_lang::system_program::{create_account, CreateAccount};
use mpl_core::instructions::CreateV2CpiBuilder;
use mpl_core::types::{Attribute, Attributes, Plugin, PluginAuthority, PluginAuthorityPair};

use super::vault::pay_from_vault;
use crate::errors::ClawError;
use crate::state::*;
use crate::{Claim, ClaimBumps};

/// Settles a finished game on base: mint the prize, or refund the credit.
///
/// Idempotent twice over: `Play.claimed` flips to true, and the asset lives at the deterministic
/// PDA `["asset", play, game number]`, so a second mint of the same game can never succeed while
/// every game still gets its own address.
pub fn handler(mut ctx: Context<Claim>) -> Result<()> {
    match plan_claim(&ctx.accounts.play, &ctx.accounts.machine.slots)? {
        ClaimPlan::Refund { lamports, reason } => {
            pay_from_vault(
                &ctx.accounts.system_program.to_account_info(),
                &ctx.accounts.vault.to_account_info(),
                &ctx.accounts.player.to_account_info(),
                &ctx.accounts.machine.key(),
                ctx.accounts.machine.vault_bump,
                lamports,
            )?;
            msg!("refunded {} lamports ({:?})", lamports, reason);
        }
        ClaimPlan::Mint { slot, sellback_lamports } => mint(&mut ctx.accounts, &ctx.bumps, slot, sellback_lamports)?,
    }
    ctx.accounts.play.claimed = true;
    Ok(())
}

fn mint(a: &mut Claim<'_>, bumps: &ClaimBumps, slot: u8, sellback_lamports: u64) -> Result<()> {
    let machine_key = a.machine.key();
    let play_key = a.play.key();
    let asset_key = a.asset.key();
    let slot_cfg = &a.machine.slots[slot as usize];
    let name = slot_cfg.name.clone();
    let uri = format!("{}{}.json", a.machine.uri_prefix, slot);
    let attributes = vec![
        Attribute { key: "creature".to_string(), value: name.clone() },
        Attribute { key: "slot".to_string(), value: slot.to_string() },
        Attribute { key: "play".to_string(), value: play_key.to_string() },
        Attribute { key: "game".to_string(), value: a.play.vrf_epoch.to_string() },
    ];

    let epoch = a.play.vrf_epoch.to_le_bytes();
    let asset_seeds: &[&[u8]] = &[ASSET_SEED, play_key.as_ref(), &epoch, &[bumps.asset]];
    let machine_seeds: &[&[u8]] = &[MACHINE_SEED, a.machine.authority.as_ref(), &[a.machine.bump]];

    let core = a.mpl_core_program.to_account_info();
    let asset = a.asset.to_account_info();
    let collection = a.collection.to_account_info();
    let machine = a.machine.to_account_info();
    let player = a.player.to_account_info();
    let system = a.system_program.to_account_info();
    CreateV2CpiBuilder::new(&core)
        .asset(&asset)
        .collection(Some(&collection))
        .authority(Some(&machine)) // the collection's update authority signs, via the machine seeds
        .payer(&player)
        .owner(Some(&player))
        .update_authority(None)
        .system_program(&system)
        .name(name)
        .uri(uri)
        .plugins(vec![PluginAuthorityPair {
            plugin: Plugin::Attributes(Attributes { attribute_list: attributes }),
            authority: Some(PluginAuthority::UpdateAuthority),
        }])
        .invoke_signed(&[asset_seeds, machine_seeds])?;

    // Receipt, created by hand because it exists only when a prize was minted.
    let space = 8 + Prize::INIT_SPACE;
    let prize_seeds: &[&[u8]] = &[PRIZE_SEED, asset_key.as_ref(), &[bumps.prize]];
    create_account(
        CpiContext::new_with_signer(
            system.key(),
            CreateAccount { from: player.clone(), to: a.prize.to_account_info() },
            &[prize_seeds],
        ),
        Rent::get()?.minimum_balance(space),
        space as u64,
        &crate::ID,
    )?;
    let prize = Prize { slot, play: play_key, sold: false, sellback_lamports, bump: bumps.prize };
    let mut data = a.prize.try_borrow_mut_data()?;
    prize.try_serialize(&mut &mut data[..])?;
    drop(data);

    let minted = &mut a.machine.slots[slot as usize].minted;
    *minted = minted.checked_add(1).ok_or(ClawError::MathOverflow)?;
    msg!("minted slot {} to {} (asset {})", slot, a.player.key(), asset_key);
    let _ = machine_key;
    Ok(())
}
