use anchor_lang::prelude::*;

declare_id!("8cBBt1yhJFW2hvQNTTHxf6t6Vntvo2Stizmt6GPD8Y1p");

pub const MAX_TASKS: usize = 20;
pub const MAX_CONTENT_LEN: usize = 100;

#[program]
pub mod todo_dapp_solana {
    use super::*;

    pub fn initialize_user(ctx: Context<InitializeUser>) -> Result<()> {
        let user_tasks = &mut ctx.accounts.user_tasks;
        user_tasks.owner = ctx.accounts.user.key();
        user_tasks.next_id = 1;
        user_tasks.tasks = Vec::new();
        user_tasks.bump = ctx.bumps.user_tasks;
        Ok(())
    }

    pub fn create_task(
        ctx: Context<MutateTasks>,
        content: String,
        priority: u8,
        deadline: i64,
    ) -> Result<()> {
        require!(!content.is_empty(), TodoError::EmptyContent);
        require!(content.len() <= MAX_CONTENT_LEN, TodoError::ContentTooLong);
        require!((1..=3).contains(&priority), TodoError::InvalidPriority);

        let user_tasks = &mut ctx.accounts.user_tasks;
        require!(user_tasks.tasks.len() < MAX_TASKS, TodoError::TooManyTasks);

        let clock = Clock::get()?;
        let task = Task {
            id: user_tasks.next_id,
            content,
            completed: false,
            priority,
            deadline,
            created_at: clock.unix_timestamp,
        };
        user_tasks.tasks.push(task);
        user_tasks.next_id = user_tasks.next_id.checked_add(1).unwrap();
        Ok(())
    }

    pub fn toggle_complete(ctx: Context<MutateTasks>, task_id: u64) -> Result<()> {
        let user_tasks = &mut ctx.accounts.user_tasks;
        let task = user_tasks
            .tasks
            .iter_mut()
            .find(|t| t.id == task_id)
            .ok_or(TodoError::TaskNotFound)?;
        task.completed = !task.completed;
        Ok(())
    }

    pub fn delete_task(ctx: Context<MutateTasks>, task_id: u64) -> Result<()> {
        let user_tasks = &mut ctx.accounts.user_tasks;
        let pos = user_tasks
            .tasks
            .iter()
            .position(|t| t.id == task_id)
            .ok_or(TodoError::TaskNotFound)?;
        user_tasks.tasks.remove(pos);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeUser<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + UserTasks::INIT_SPACE,
        seeds = [b"user-tasks", user.key().as_ref()],
        bump,
    )]
    pub user_tasks: Account<'info, UserTasks>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MutateTasks<'info> {
    #[account(
        mut,
        seeds = [b"user-tasks", user.key().as_ref()],
        bump = user_tasks.bump,
    )]
    pub user_tasks: Account<'info, UserTasks>,
    #[account(mut)]
    pub user: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct UserTasks {
    pub owner: Pubkey,
    pub next_id: u64,
    pub bump: u8,
    #[max_len(MAX_TASKS)]
    pub tasks: Vec<Task>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Task {
    pub id: u64,
    #[max_len(MAX_CONTENT_LEN)]
    pub content: String,
    pub completed: bool,
    pub priority: u8,
    pub deadline: i64,
    pub created_at: i64,
}

#[error_code]
pub enum TodoError {
    #[msg("Task content cannot be empty")]
    EmptyContent,
    #[msg("Task content is too long")]
    ContentTooLong,
    #[msg("Priority must be 1 (low), 2 (medium), or 3 (high)")]
    InvalidPriority,
    #[msg("Task not found")]
    TaskNotFound,
    #[msg("You have reached the maximum number of tasks")]
    TooManyTasks,
    #[msg("Unauthorized")]
    Unauthorized,
}
