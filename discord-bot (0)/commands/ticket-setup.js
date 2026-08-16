const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const STEP_TIMEOUT = 5 * 60 * 1000; // 5 minutes per step
const REQUIRED_COUNT = 3;
const OPTIONAL_MAX = 10;
const TOTAL_MAX = REQUIRED_COUNT + OPTIONAL_MAX;

function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function slugify(label) {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `category_${Date.now()}`
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Interactively configure the ticket panel (description, style, categories)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    // ---- Step 1: title + description modal ----
    const descModal = new ModalBuilder().setCustomId('ticket_setup_desc_modal').setTitle('Ticket Panel Setup (1/3)');

    const titleInput = new TextInputBuilder()
      .setCustomId('panel_title')
      .setLabel('Panel title (leave blank for none)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(100);

    const descInput = new TextInputBuilder()
      .setCustomId('panel_description')
      .setLabel('Panel description')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(2000);

    descModal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput)
    );

    await interaction.showModal(descModal);

    const descSubmit = await interaction
      .awaitModalSubmit({ time: STEP_TIMEOUT, filter: (i) => i.customId === 'ticket_setup_desc_modal' && i.user.id === interaction.user.id })
      .catch(() => null);

    if (!descSubmit) return; // timed out — silently stop, nothing saved

    const panelTitle = descSubmit.fields.getTextInputValue('panel_title').trim();
    const panelDescription = descSubmit.fields.getTextInputValue('panel_description').trim();

    // ---- Step 2: dropdown vs buttons ----
    const styleRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_setup_style_dropdown').setLabel('Dropdown').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_setup_style_buttons').setLabel('Buttons').setStyle(ButtonStyle.Primary)
    );

    await descSubmit.reply({
      content: 'Step 2/3 — Should the panel use a **dropdown menu** or **buttons** for the categories?',
      components: [styleRow],
      ephemeral: true,
    });

    let promptMsg = await descSubmit.fetchReply();
    const styleClick = await promptMsg
      .awaitMessageComponent({ time: STEP_TIMEOUT, filter: (i) => i.user.id === interaction.user.id })
      .catch(() => null);

    if (!styleClick) return;

    const style = styleClick.customId === 'ticket_setup_style_buttons' ? 'buttons' : 'dropdown';

    // ---- Step 3: collect categories (3 required, then up to 10 optional) ----
    const categories = [];
    let current = styleClick; // most recent interaction we can act on

    while (true) {
      const requiredLeft = Math.max(0, REQUIRED_COUNT - categories.length);
      const canFinish = categories.length >= REQUIRED_COUNT;
      const atMax = categories.length >= TOTAL_MAX;

      const row = new ActionRowBuilder();
      if (!atMax) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_setup_add_category')
            .setLabel(
              requiredLeft > 0
                ? `Add Required Category (${categories.length + 1}/${REQUIRED_COUNT})`
                : `Add Optional Category (${categories.length - REQUIRED_COUNT + 1}/${OPTIONAL_MAX})`
            )
            .setStyle(ButtonStyle.Success)
        );
      }
      if (canFinish) {
        row.addComponents(
          new ButtonBuilder().setCustomId('ticket_setup_finish').setLabel('Finish Setup').setStyle(ButtonStyle.Primary)
        );
      }

      const summary = categories.length
        ? categories.map((c, i) => `${i + 1}. ${c.emoji || ''} **${c.label}**`).join('\n')
        : '*(none yet)*';

      const content =
        `**Step 3/3 — Ticket Categories**\n` +
        (requiredLeft > 0
          ? `Add ${requiredLeft} more required categor${requiredLeft === 1 ? 'y' : 'ies'}.`
          : atMax
          ? `Maximum of ${TOTAL_MAX} categories reached.`
          : `Add up to ${TOTAL_MAX - categories.length} more optional categories, or finish.`) +
        `\n\n${summary}`;

      if (current.isModalSubmit()) {
        await current.reply({ content, components: [row], ephemeral: true });
      } else {
        await current.update({ content, components: [row] });
      }
      promptMsg = await current.fetchReply();

      const click = await promptMsg
        .awaitMessageComponent({ time: STEP_TIMEOUT, filter: (i) => i.user.id === interaction.user.id })
        .catch(() => null);

      if (!click) break; // timed out — fall through to save-what-we-have below

      if (click.customId === 'ticket_setup_finish') {
        current = click;
        break;
      }

      // "Add category" clicked — show the category modal
      const catModal = new ModalBuilder().setCustomId('ticket_setup_cat_modal').setTitle(`Category ${categories.length + 1}`);

      const labelInput = new TextInputBuilder()
        .setCustomId('cat_label')
        .setLabel('Label shown to users')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80);

      const catDescInput = new TextInputBuilder()
        .setCustomId('cat_description')
        .setLabel('Short description')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

      const emojiInput = new TextInputBuilder()
        .setCustomId('cat_emoji')
        .setLabel('Emoji (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(10);

      catModal.addComponents(
        new ActionRowBuilder().addComponents(labelInput),
        new ActionRowBuilder().addComponents(catDescInput),
        new ActionRowBuilder().addComponents(emojiInput)
      );

      await click.showModal(catModal);

      const catSubmit = await click
        .awaitModalSubmit({ time: STEP_TIMEOUT, filter: (i) => i.customId === 'ticket_setup_cat_modal' && i.user.id === interaction.user.id })
        .catch(() => null);

      if (!catSubmit) break; // timed out mid-category — fall through to save-what-we-have

      const label = catSubmit.fields.getTextInputValue('cat_label').trim();
      categories.push({
        id: slugify(label),
        label,
        description: catSubmit.fields.getTextInputValue('cat_description').trim(),
        emoji: catSubmit.fields.getTextInputValue('cat_emoji').trim() || undefined,
      });

      current = catSubmit;
    }

    // ---- Save (or bail if not enough categories were added) ----
    if (categories.length < REQUIRED_COUNT) {
      const msg = {
        content: `⚠️ Setup cancelled — at least ${REQUIRED_COUNT} categories are required (you added ${categories.length}). Nothing was saved.`,
        components: [],
      };
      if (current.replied || current.deferred) await current.followUp({ ...msg, ephemeral: true }).catch(() => {});
      else await current.reply({ ...msg, ephemeral: true }).catch(() => {});
      return;
    }

    config.panel = config.panel || {};
    config.panel.title = panelTitle;
    config.panel.description = panelDescription;
    config.panel.style = style;
    config.categories = categories;
    saveConfig();

    const doneMsg = {
      content: `✅ Ticket panel setup saved! ${categories.length} categories configured as **${style}** style. Run \`/ticket-panel\` to post it.`,
      components: [],
    };

    if (current.isButton && current.isButton() && current.customId === 'ticket_setup_finish') {
      await current.update(doneMsg).catch(() => {});
    } else if (current.replied || current.deferred) {
      await current.followUp({ ...doneMsg, ephemeral: true }).catch(() => {});
    } else {
      await current.reply({ ...doneMsg, ephemeral: true }).catch(() => {});
    }
  },
};
