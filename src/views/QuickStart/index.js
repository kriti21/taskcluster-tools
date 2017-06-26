import React from 'react';
import { Row, Col, Form, FormGroup, FormControl, ControlLabel, Checkbox, ButtonToolbar, Button, Glyphicon }
  from 'react-bootstrap';
import { safeDump } from 'js-yaml';
import { Github } from 'taskcluster-client';
import CodeEditor from '../../components/CodeEditor';
import { info } from './styles.css';

const initialYaml = {
  version: 0,
  metadata: {
    name: '',
    description: '',
    owner: '{{ event.head.user.email }}',
    source: '{{ event.head.repo.url }}'
  },
  tasks: [
    {
      provisionerId: '{{ taskcluster.docker.provisionerId }}',
      workerType: '{{ taskcluster.docker.workerType }}',
      extra: {
        github: {
          env: true,
          events: []
        }
      },
      payload: {
        maxRunTime: 3600,
        image: 'node',
        command: []
      },
      metadata: {
        name: '',
        description: '',
        owner: '{{ event.head.user.email }}',
        source: '{{ event.head.repo.url }}'
      }
    }
  ]
};

const baseCmd = [
  'git clone {{event.head.repo.url}} repo',
  'cd repo',
  'git config advice.detachedHead false',
  'git checkout {{event.head.sha}}'
];

const cmdDirectory = (type, org = '<YOUR_ORG>', repo = '<YOUR_REPO>') => ({
  node: [
    '/bin/bash',
    '--login',
    '-c',
    baseCmd.concat(['npm install .', 'npm test']).join(' && ')
  ],
  python: [
    '/bin/bash',
    '--login',
    '-c',
    baseCmd.concat(['pip install tox', 'tox']).join(' && ')
  ],
  'jimmycuadra/rust': [
    '/bin/bash',
    '--login',
    '-c',
    baseCmd.concat(['rustc --test unit_test.rs', './unit_test']).join(' && ')
  ],
  golang: [
    '/bin/bash',
    '--login',
    '-c',
    [
      `mkdir -p /go/src/github.com/${org}/${repo}`,
      `cd /go/src/github.com/${org}/${repo}`,
      'git init',
      'git fetch {{ event.head.repo.url }} {{ event.head.ref }}',
      'git config advice.detachedHead false',
      'git checkout {{ event.head.sha }}',
      'go install',
      'go test ./...'
    ].join(' && ')
  ]
})[type];

const githubClient = new Github({});

export default class YamlCreator extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      rootName: '',
      rootDescription: '',
      tasks: [],
      events: new Set(),
      image: 'node',
      commands: cmdDirectory('node'),
      currentCmd: cmdDirectory('node'),
      displayCmds: true,
      taskName: '',
      taskDescription: '',
      pullRequestOpened: false,
      pullRequestClosed: false,
      pullRequestSynchronized: false,
      pullRequestReopened: false,
      pushMade: false,
      releaseMade: false,
      resetActive: false,
      owner: '',
      repo: '',
      installedState: null
    };
  }


  saveTextInput(event) {
    this.setState({
      [event.target.name]: event.target.value,
      resetActive: true
    });
  }

  handleEventsSelection(event) {
    const events = new Set(this.state.events);

    events.has(event.target.name) ?
      events.delete(event.target.name) :
      events.add(event.target.name);

    this.setState({
      events: [...events],
      [event.target.id]: !this.state[event.target.id],
      resetActive: true
    });
  }

  handleImageSelection(event) {
    const currentCmd = cmdDirectory(event.target.value, this.state.owner, this.state.repo);
    this.setState({
      image: event.target.value,
      currentCmd,
      resetActive: true,
      commands: this.state.displayCmds ? currentCmd : []
    });
  }

  handleCommandsSelection(event) {
    this.setState({
      displayCmds: event.target.value === 'standard',
      currentCmd: this.state.commands,
      commands: event.target.value === 'standard' ? this.state.commands : []
    });
  }

  resetAll() {
    this.setState({
      resetActive: false,
      rootName: '',
      rootDescription: '',
      tasks: [],
      events: new Set(),
      taskName: '',
      taskDescription: '',
      pullRequestOpened: false,
      pullRequestClosed: false,
      pullRequestSynchronized: false,
      pullRequestReopened: false,
      pushMade: false,
      releaseMade: false
    });
  }

  renderEditor() {
    const newYaml = safeDump({
      ...initialYaml,
      metadata: {
        ...initialYaml.metadata,
        name: this.state.rootName,
        description: this.state.rootDescription
      },
      tasks: [{
        ...initialYaml.tasks[0],
        ...{
          metadata: {
            ...initialYaml.tasks[0].metadata,
            name: this.state.taskName,
            description: this.state.taskDescription
          },
          extra: {
            github: {
              events: [...this.state.events]
            }
          },
          payload: {
            ...initialYaml.tasks[0].payload,
            command: this.state.commands,
            image: this.state.image
          }
        }
      }]
    });

    return (
      <div>
        <hr />
        <CodeEditor mode="yaml" value={newYaml} />
      </div>
    );
  }

  installedStatus() {
    const { owner, repo } = this.state;

    if (!owner || !repo) {
      return this.setState({ installedState: null });
    }

    this.setState({ installedState: 'loading' }, async () => {
      const { installed } = await githubClient.isInstalledFor(owner, repo);

      this.setState({ installedState: installed ? 'success' : 'error' });
    });
  }

  renderInfoText() {
    const { installedState } = this.state;

    if (!installedState) {
      return null;
    }

    if (installedState === 'loading') {
      return <p className="text-info">Searching...</p>;
    }

    return this.state.installedState === 'success' ?
      (
        <p className="text-success">
          You are all set!
        </p>
      ) :
      (
        <p className="text-danger">
          The integration has not been set up for this repository.
          Please contact the organization owner to have it set up!
        </p>
      );
  }

  render() {
    return (
      <div>
        <Row>
          <Col sm={12}>
            <h4>GitHub Quick-Start</h4>
            <p>
              This tool lets you easily generate a simple generic <code>.taskcluster.yml</code> file,
              which should live in the root of your repository. It defines
              tasks that you want TaskCluster to run for you. The tasks will run when certain
              GitHub events happen. You will choose the events you are interested in while
              creating the file.
            </p>
            <hr />
            <h5>For organization members: Check if your repository already has TaskCluster</h5>
            <Form componentClass="fieldset" inline>
              <FormGroup validationState={this.state.installedState === 'loading' ? null : this.state.installedState}>
                <FormControl
                  type="text"
                  name="owner"
                  placeholder="Enter organization name"
                  onChange={e => this.saveTextInput(e)} />
                <FormControl.Feedback />
                {' '}/{' '}
                <FormControl
                  type="text"
                  name="repo"
                  placeholder="Enter repository name"
                  onChange={e => this.saveTextInput(e)} />
                <FormControl.Feedback />
              </FormGroup>
              {' '}
              <Button bsStyle="info" onClick={() => this.installedStatus()}>
                <Glyphicon glyph="question-sign" /> Check
              </Button>
              {this.renderInfoText()}
            </Form>
            <hr />
            <h5>For independent developers and organization owners: How to set up your repository with TaskCluster</h5>
            <ul>
              <li>
                Fill out the form below. All
                changes in the form will instantly show up in the code field.
              </li>
              <li>
                When you are done editing, copy the contents of the code field and paste it into a file
                named <code>.taskcluster.yml</code> in the root of your repository.
              </li>
              <li>
                Make sure to install
                the <a href="https://github.com/integration/taskcluster" target="_blank" rel="noopener noreferrer">
                TaskCluster-GitHub integration</a>.
              </li>
            </ul>
            <p>
              Optionally, after you create your file, you can edit
              it here or in you favorite editor to add more functionality. Please refer to
              the <a href="https://docs.taskcluster.net/reference/integrations/github/docs/usage" target="_blank" rel="noopener noreferrer">
              full documentation on our configuration files</a>.
            </p>
            <hr />
          </Col>
        </Row>

        <Row>
          <Col md={5}>
            <h5>Enter the name and description of your project or these tasks:</h5>
            <p className={info}>
              <Glyphicon glyph="info-sign" />&nbsp;
              These will appear at the top of the file and help the reader understand what they are seeing.
            </p>

            <FormGroup>
              <ControlLabel>Name:</ControlLabel>
              <FormControl
                type="text"
                placeholder="Name"
                name="rootName"
                value={this.state.rootName}
                onChange={e => this.saveTextInput(e)} />
            </FormGroup>
            <FormGroup>
              <ControlLabel>Description:</ControlLabel>
              <FormControl
                type="text"
                placeholder="Description"
                name="rootDescription"
                value={this.state.rootDescription}
                onChange={e => this.saveTextInput(e)} />
            </FormGroup>
            <hr />
            <h5>Define your task:</h5>
            <FormGroup>
              <ControlLabel>Name:</ControlLabel>
              <FormControl
                type="text"
                placeholder="Name of the task"
                name="taskName"
                value={this.state.taskName}
                onChange={e => this.saveTextInput(e)} />
            </FormGroup>
            <FormGroup>
              <ControlLabel>Description:</ControlLabel>
              <FormControl
                type="text"
                placeholder="Description of the task"
                name="taskDescription"
                value={this.state.taskDescription}
                onChange={e => this.saveTextInput(e)} />
            </FormGroup>

            <FormGroup id="checkboxGroup">
              <ControlLabel>This task should run when:</ControlLabel>
              <Checkbox
                name="pull_request.opened"
                id="pullRequestOpened"
                className="data_checkboxes"
                checked={this.state.pullRequestOpened}
                onChange={e => this.handleEventsSelection(e)}>
                Pull request opened
              </Checkbox>
              <Checkbox
                name="pull_request.closed"
                id="pullRequestClosed"
                className="data_checkboxes"
                checked={this.state.pullRequestClosed}
                onChange={e => this.handleEventsSelection(e)}>
                Pull request merged or closed
              </Checkbox>
              <Checkbox
                name="pull_request.synchronize"
                id="pullRequestSynchronized"
                className="data_checkboxes"
                checked={this.state.pullRequestSynchronized}
                onChange={e => this.handleEventsSelection(e)}>
                New commit made in an opened pull request
              </Checkbox>
              <Checkbox
                name="pull_request.reopened"
                id="pullRequestReopened"
                className="data_checkboxes"
                checked={this.state.pullRequestReopened}
                onChange={e => this.handleEventsSelection(e)}>
                Pull request re-opened
              </Checkbox>
              <Checkbox
                name="push"
                id="pushMade"
                className="data_checkboxes"
                checked={this.state.pushMade}
                onChange={e => this.handleEventsSelection(e)}>
                Push
              </Checkbox>
              <Checkbox
                name="release"
                id="releaseMade"
                className="data_checkboxes"
                checked={this.state.releaseMade}
                onChange={e => this.handleEventsSelection(e)}>
                Release or tag created
              </Checkbox>
            </FormGroup>

            <FormGroup>
              <ControlLabel>
                Language your project uses:
              </ControlLabel>
              <p className={info}>
                <Glyphicon glyph="info-sign" />&nbsp;
                This will select a corresponding docker image.
              </p>
              <FormControl componentClass="select" name="image" onChange={e => this.handleImageSelection(e)}>
                <option value="node">Node.js</option>
                <option value="python">Python</option>
                <option value="jimmycuadra/rust">Rust</option>
                <option value="golang">Go</option>
              </FormControl>
            </FormGroup>

            <FormGroup>
              <ControlLabel>Commands: </ControlLabel>
              <FormControl componentClass="select" placeholder="Pick one..." onChange={e => this.handleCommandsSelection(e)}>
                <option value="standard">Clone repo and run my tests</option>
                <option value="custom">I will define them myself</option>
              </FormControl>
            </FormGroup>
          </Col>
          <Col md={7}>
            <ButtonToolbar>
              <Button bsStyle="danger" disabled={!this.state.resetActive} onClick={() => this.resetAll()}>
                <Glyphicon glyph="repeat" /> Reset form and file
              </Button>
            </ButtonToolbar>
            {this.renderEditor()}
          </Col>
        </Row>
      </div>
    );
  }
}