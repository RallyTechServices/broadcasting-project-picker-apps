Ext.define("TSMultipleProjectGrid", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },

    config: {
        defaultSettings: {
            showScopeSelector: true,
            showControls: true
        }
    },

    integrationHeaders : {
        name : "TSMultipleProjectGrid"
    },
                        
    launch: function() {
        
       this._addComponents();
       
    },
    
    _addComponents: function() {
        this.removeAll();

        this.headerContainer = this.add({
            xtype:'container',
            itemId:'header-ct', 
            layout: {type: 'hbox'}
        });
        this.displayContainer = this.add({
            xtype:'container',
            itemId:'body-ct'
        });

        if ( this.getSetting('showScopeSelector') || this.getSetting('showScopeSelector') == "true" ) {
            this.headerContainer.add({
                xtype: 'tsmultiprojectpicker',
                listeners: {
                    change: function(picker, projects) {
                        this._changeProjects(picker,projects);
                        this._publishProjects();
                    },
                    scope: this
                }
            });
            this.subscribe(this, 'requestProjects', this._publishProjects, this);
        } else {
            this.subscribe(this, 'projectsChanged', this._changeProjects, this);
            this.publish('requestProjects', this);
        }
    },
    
    _changeProjects: function(picker,projects) {
        this.projects = projects;
        this.logger.log('Projects Changed', picker, projects);
        
        this.displayContainer.removeAll();
        this._loadGridBoard();
    },
    
    _publishProjects: function() {
        this.publish('projectsChanged', this.down('tsmultiprojectpicker'), this.projects || []);  
    },
    
    _loadGridBoard: function() {
        var me = this;
        
        this.logger.log('loadGridBoard', this._getModelNames())
        this.enableAddNew = this._shouldEnableAddNew();
        this.enableRanking = this._shouldEnableRanking();

        Rally.data.ModelFactory.getModels({
            types: this._getModelNames(),
            requester: this
        }).then({
            success: function (models) {
                this.logger.log('Loaded models');
                this.models = _.transform(models, function (result, value) {
                    result.push(value);
                }, []);

                this.modelNames = _.keys(models);

                var config = {
                    autoLoad: false,
                    childPageSizeEnabled: true,
                    enableHierarchy: true,
                    fetch: this._getColumns(), //this.columnNames,
                    models: _.clone(this.models),
                    pageSize: 25,
                    remoteSort: true,
                    root: {expanded: true}
                };
                
                if ( this.projects && this.projects.length > 0 ) {
                    config.context = { project: null };
                }
                
                Ext.create('Rally.data.wsapi.TreeStoreBuilder').build(config).then({
                    success: this._addGridBoard,
                    scope: this
                });
            },
            scope: this
        });
    },
    
    _getGridBoard: function() {
        return this.down('rallygridboard');
    },
    
    _addGridBoard: function (store) {
        this.logger.log('_addGridBoard');
        if (this._getGridBoard()) {
            this._getGridBoard().destroy();
        }

        var modelNames =  _.clone(this.modelNames),
            columns = this._getColumns(),
            filters = this._getPermanentFilters();
            
        var store_config = { filters: filters };
        
        if ( this.projects && this.projects.length > 0 ) {
            store_config.context = { project: null };
        }
        this.logger.log('store config: ', store_config);
        
        var gridboard = Ext.create('Rally.ui.gridboard.GridBoard', {
            itemId: 'gridboard',
            toggleState: 'grid',
            context: this.getContext(),
            modelNames: modelNames,
            plugins:  [
                { 
                    ptype: 'rallygridboardaddnew' 
                },
                {
                    ptype: 'rallygridboardfieldpicker',
                    headerPosition: 'left',
                    modelNames: modelNames,
                    stateful: false,
                    popoverConfig: {
                        height: 250
                    },
                    fieldPickerConfig: { 
                        pickerCfg: {
                            height: 150
                        } 
                    },
                    gridAlwaysSelectedValues: this._getAlwaysSelectedFields(),
                    margin: '3 0 0 10'
                },{
                    ptype: 'rallygridboardcustomfiltercontrol',
                    filterControlConfig: {
                        modelNames: modelNames,
//                        stateful: true,
//                        stateId: this.getContext().getScopedStateId('project-picker-grid-filter')
                    },
                    showOwnerFilter: true,
                    ownerFilterControlConfig: {
//                       stateful: true,
//                       stateId: this.getContext().getScopedStateId('project-picker-grid-filter-owner')
                    }
                }

            ],
            storeConfig: store_config,
            gridConfig: {
               // allColumnsStateful: true,
//                stateful: true,
//                stateId: this.getContext().getScopedStateId('project-picker-grid-filter'),
//                state: ['columnschanged','viewready','reconfigure'],
                store: store,
                columnCfgs: this._getColumns(),
                height: this.getHeight()
            }
        });

        console.log('store', store);
        this.gridboard = this.add(gridboard);

        if (!this.getSetting('showControls')) {
            this.gridboard.getHeader().hide();
        }
    },
    
    _getModelNames: function(){
        return 'UserStory';
    },
    
    _getPermanentFilters: function () {
        var filters = this._getProjectFilter();
        var query_filter = this._getQueryFilter();
        if ( query_filter ) {
            this.logger.log('query filter:', query_filter);
            
            filters = filters.and(query_filter);
        }
        this.logger.log('getPermanentFilters', filters);
        return filters;
    },
    
    _getQueryFilter: function () {
        var query = new Ext.Template(this.getSetting('query')).apply({
            projectName: this.getContext().getProject().Name,
            projectOid: this.getContext().getProject().ObjectID,
            user: this.getContext().getUser()._ref
        });
        var filter = null;
        if (query) {
            try {
                filter =  Rally.data.wsapi.Filter.fromQueryString(query) ;
            } catch(e) {
                Rally.ui.notify.Notifier.showError({ message: e.message });
                return null;
            }
        }

        return filter;
    },
    
    _getProjectFilter: function(){
        this.logger.log('_getProjectFilter', this.projects)

        if (!this.projects || this.projects.length === 0){
            return { property:'Project.ObjectID', operator: '>', value: 0 };
        }
        
        var filters =  Ext.Array.map(this.projects, function(project) {
            return { property:'Project.ObjectID', value: project.ObjectID };
        });

        return Rally.data.wsapi.Filter.or(filters);
    },
    
    _getAlwaysSelectedFields: function() {
        var columns = this.getSetting('columnNames') ;
                
        if ( Ext.isEmpty(columns) ) {
            return [];
        }
        
        if ( Ext.isString(columns) ) {
            return columns.split(',');
        }
        
        columns = Ext.Array.filter( columns, function(column){
            return ( column != 'FormattedID' );
        });
        
        return Ext.Array.unique( columns );
    },

    _getColumns: function() {
        return this._getAlwaysSelectedFields();
    },
    
    _shouldEnableAddNew: function() {
        return true;
    },

    _shouldEnableRanking: function(){
        return this.type && this.type.toLowerCase() !== 'task';
    },
    
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    getSettingsFields: function() {
        return [{
            name: 'showScopeSelector',
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show Scope Selector'
        },
        { type: 'query' },
        {
            name: 'showControls',
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show Control Bar'
        }];
    },
    
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    }
});
