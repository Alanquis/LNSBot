const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages], partials: [Partials.Channel] });

const TOKEN = process.env.TOKEN;
const STAFF_CHANNEL_ID = '1412816870087721041'; // replace with your staff-app channel ID

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Command to send the initial embed with the button
client.on('messageCreate', async (message) => {
    if (!message.guild) return;
    if (!message.content.startsWith('!sendmessage')) return;
    if (!message.member.permissions.has('Administrator')) return;

    const args = message.content.split(' ');
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('Please mention a valid channel.');

    const embed = new EmbedBuilder()
        .setTitle('Application')
        .setDescription('Click the button below to start your application!')
        .setColor('Blue');

    const button = new ButtonBuilder()
        .setCustomId('apply_button')
        .setLabel('Apply')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await channel.send({ embeds: [embed], components: [row] });
});

// Handle button click
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'apply_button') {
        const modal = new ModalBuilder()
            .setCustomId('application_modal')
            .setTitle('Application Form');

        // 4 questions
        const q1 = new TextInputBuilder()
            .setCustomId('question1')
            .setLabel('Question 1')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const q2 = new TextInputBuilder()
            .setCustomId('question2')
            .setLabel('Question 2')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const q3 = new TextInputBuilder()
            .setCustomId('question3')
            .setLabel('Question 3')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const q4 = new TextInputBuilder()
            .setCustomId('question4')
            .setLabel('Question 4')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(q1);
        const row2 = new ActionRowBuilder().addComponents(q2);
        const row3 = new ActionRowBuilder().addComponents(q3);
        const row4 = new ActionRowBuilder().addComponents(q4);

        modal.addComponents(row1, row2, row3, row4);

        await interaction.showModal(modal);
    }

    // Staff approve/decline buttons
    if (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('decline_')) {
        const [action, userId] = interaction.customId.split('_');
        const user = await client.users.fetch(userId);

        if (action === 'approve') {
            await user.send({
                embeds: [new EmbedBuilder().setTitle('Application Approved').setDescription('Congratulations! Your application has been approved.\nHere is the group link: [Your Link]').setColor('Green')]
            });
            await interaction.update({ content: `Application approved for <@${userId}>`, components: [] });
        } else if (action === 'decline') {
            const reason = 'Your application did not meet our requirements.'; // optional: you can make staff enter reason via modal
            await user.send({
                embeds: [new EmbedBuilder().setTitle('Application Declined').setDescription(`Unfortunately, your application was declined.\nReason: ${reason}`).setColor('Red')]
            });
            await interaction.update({ content: `Application declined for <@${userId}>`, components: [] });
        }
    }
});

// Handle modal submit
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== 'application_modal') return;

    const q1 = interaction.fields.getTextInputValue('question1');
    const q2 = interaction.fields.getTextInputValue('question2');
    const q3 = interaction.fields.getTextInputValue('question3');
    const q4 = interaction.fields.getTextInputValue('question4');

    const staffChannel = await client.channels.fetch(STAFF_CHANNEL_ID);

    const embed = new EmbedBuilder()
        .setTitle('New Application')
        .setDescription(`New application submitted by <@${interaction.user.id}>`)
        .addFields(
            { name: 'Question 1', value: q1 },
            { name: 'Question 2', value: q2 },
            { name: 'Question 3', value: q3 },
            { name: 'Question 4', value: q4 }
        )
        .setColor('Yellow');

    const approveButton = new ButtonBuilder()
        .setCustomId(`approve_${interaction.user.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success);

    const declineButton = new ButtonBuilder()
        .setCustomId(`decline_${interaction.user.id}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(approveButton, declineButton);

    await staffChannel.send({ embeds: [embed], components: [row] });
    await interaction.user.send('Your application has been submitted to the staff. You will be notified via DM once reviewed.');
    await interaction.reply({ content: 'Application submitted!', ephemeral: true });
});

client.login(TOKEN);
